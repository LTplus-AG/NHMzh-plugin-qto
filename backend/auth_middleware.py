"""
Authentication middleware for QTO backend service
"""
import os
from typing import Optional, Dict, List, Any
from fastapi import HTTPException, Security, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
import httpx
import requests
from functools import lru_cache
import logging
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer()

# Cache for JWKS
_jwks_cache = None
_jwks_cache_time = None
JWKS_CACHE_DURATION = timedelta(minutes=10)

# Configuration
KEYCLOAK_AUTHORITY = os.getenv("KEYCLOAK_AUTHORITY", "http://localhost:8080/realms/nhmzh")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "plugin-qto")
ALLOWED_ALGORITHMS = ["RS256"]

# Role definitions for QTO plugin
PLUGIN_ROLES = {
    "read": [
        "Admin", "Projektleitung_Architektur", "Projektleitung_Statik",
        "Projektleitung_Gebaudetechnik", "Fachplanung_Kosten",
        "Fachplanung_Oekobilanz", "Fachplanung_Gebaudetechnik", "Viewer"
    ],
    "write": [
        "Admin", "Projektleitung_Architektur", "Projektleitung_Statik",
        "Projektleitung_Gebaudetechnik", "Fachplanung_Kosten",
        "Fachplanung_Oekobilanz", "Fachplanung_Gebaudetechnik"
    ],
    "delete": ["Admin"]
}

class User:
    """User model extracted from JWT token"""
    def __init__(self, token_payload: dict):
        self.id = token_payload.get("sub", "")
        self.email = token_payload.get("email", "")
        self.name = token_payload.get("name", "") or token_payload.get("preferred_username", "")
        self.preferred_username = token_payload.get("preferred_username", "")
        self.roles = self._extract_roles(token_payload)
        self.projects = []  # Will be populated from project service
        
    def _extract_roles(self, payload: dict) -> List[str]:
        """Extract roles from various possible locations in JWT"""
        roles = []
        
        # Realm roles
        if "realm_access" in payload and "roles" in payload["realm_access"]:
            roles.extend(payload["realm_access"]["roles"])
        
        # Resource/client roles
        if "resource_access" in payload:
            for resource in payload["resource_access"].values():
                if "roles" in resource:
                    roles.extend(resource["roles"])
        
        # Groups (if mapped to token)
        if "groups" in payload:
            roles.extend(payload["groups"])
        
        return list(set(roles))  # Remove duplicates
    
    def has_role(self, role: str) -> bool:
        """Check if user has a specific role"""
        return role in self.roles
    
    def has_any_role(self, roles: List[str]) -> bool:
        """Check if user has any of the specified roles"""
        return any(role in self.roles for role in roles)
    
    def can_read(self) -> bool:
        """Check if user can read QTO data"""
        return self.has_any_role(PLUGIN_ROLES["read"])
    
    def can_write(self) -> bool:
        """Check if user can write QTO data"""
        return self.has_any_role(PLUGIN_ROLES["write"])
    
    def can_delete(self) -> bool:
        """Check if user can delete QTO data"""
        return self.has_any_role(PLUGIN_ROLES["delete"])

@lru_cache()
async def get_jwks():
    """Fetch JWKS from Keycloak with caching"""
    global _jwks_cache, _jwks_cache_time
    
    # Check cache
    if _jwks_cache and _jwks_cache_time:
        if datetime.now() - _jwks_cache_time < JWKS_CACHE_DURATION:
            return _jwks_cache
    
    # Fetch new JWKS
    jwks_uri = f"{KEYCLOAK_AUTHORITY}/protocol/openid-connect/certs"
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_uri)
            response.raise_for_status()
            jwks = response.json()
            
            # Update cache
            _jwks_cache = jwks
            _jwks_cache_time = datetime.now()
            
            return jwks
    except Exception as e:
        logger.error(f"Failed to fetch JWKS: {e}")
        if _jwks_cache:  # Use stale cache if available
            return _jwks_cache
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to fetch JWKS for token validation"
        )

async def get_signing_key(token: str) -> Optional[Dict]:
    """Get the signing key for the token"""
    try:
        # Decode header without verification to get kid
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")
        
        if not kid:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing kid in header"
            )
        
        # Get JWKS
        jwks = await get_jwks()
        
        # Find the key with matching kid
        for key in jwks.get("keys", []):
            if key.get("kid") == kid:
                return key
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unable to find matching key"
        )
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token format: {str(e)}"
        )

async def verify_token(credentials: HTTPAuthorizationCredentials = Security(security)) -> User:
    """Verify JWT token and return user"""
    token = credentials.credentials
    
    try:
        # Get signing key
        key = await get_signing_key(token)
        
        if not key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to find signing key"
            )
        
        # Verify token
        payload = jwt.decode(
            token,
            key,
            algorithms=ALLOWED_ALGORITHMS,
            audience=KEYCLOAK_CLIENT_ID,
            issuer=KEYCLOAK_AUTHORITY
        )
        
        # Create user from payload
        user = User(payload)
        
        # Check if user has any valid role for this plugin
        if not user.can_read():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User does not have permission to access this plugin"
            )
        
        return user
        
    except JWTError as e:
        logger.error(f"JWT verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate credentials: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Unexpected error during authentication: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

# Dependency functions for different permission levels
async def require_read_permission(user: User = Depends(verify_token)) -> User:
    """Require read permission for the endpoint"""
    if not user.can_read():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for read operation"
        )
    return user

async def require_write_permission(user: User = Depends(verify_token)) -> User:
    """Require write permission for the endpoint"""
    if not user.can_write():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for write operation"
        )
    return user

async def require_delete_permission(user: User = Depends(verify_token)) -> User:
    """Require delete permission for the endpoint"""
    if not user.can_delete():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions for delete operation"
        )
    return user

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security)
) -> Optional[User]:
    """Get current user if authenticated, otherwise return None"""
    if not credentials:
        return None
    
    try:
        return await verify_token(credentials)
    except HTTPException:
        return None

# Project service integration
class ProjectService:
    """Service to fetch user's projects from the project-listener service"""
    
    def __init__(self):
        self.base_url = os.getenv("PROJECT_SERVICE_URL", "http://localhost:3001")
    
    async def get_user_projects(self, user: User, token: str) -> List[Dict]:
        """Fetch user's projects from the project service"""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.base_url}/api/projects/my-projects",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get("projects", [])
                else:
                    logger.error(f"Failed to fetch user projects: {response.status_code}")
                    return []
        except Exception as e:
            logger.error(f"Error fetching user projects: {e}")
            return []
    
    async def check_project_permission(
        self, user: User, project_name: str, token: str, action: str = "read"
    ) -> bool:
        """Check if user has permission for a specific project"""
        projects = await self.get_user_projects(user, token)
        
        # Check if user is member of the project
        for project in projects:
            if project.get("projectName") == project_name or project.get("erzProjectCode") == project_name:
                # Check role-based permissions
                project_roles = project.get("roles", [])
                
                if action == "read":
                    return any(role in PLUGIN_ROLES["read"] for role in project_roles)
                elif action == "write":
                    return any(role in PLUGIN_ROLES["write"] for role in project_roles)
                elif action == "delete":
                    return any(role in PLUGIN_ROLES["delete"] for role in project_roles)
        
        return False

# Global project service instance
project_service = ProjectService()

async def check_project_access(
    project_name: str,
    action: str = "read",
    user: User = Depends(verify_token),
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> User:
    """Check if user has access to a specific project"""
    # Admin users have access to all projects
    if user.has_role("Admin"):
        return user
    
    # Check project-specific permissions
    has_permission = await project_service.check_project_permission(
        user, project_name, credentials.credentials, action
    )
    
    if not has_permission:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"You don't have {action} permission for project: {project_name}"
        )
    
    return user
