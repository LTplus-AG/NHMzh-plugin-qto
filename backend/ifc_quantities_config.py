# Configuration for extracting specific quantities from IFC elements based on their class.

# Define the target quantities based on IFC class and QtoSet
# Maps IFC class names to a dictionary containing:
# - "qset": The name of the IfcElementQuantity set to look for.
# - "area", "volume", "length": The specific quantity name within the set to extract.
TARGET_QUANTITIES = {
    "IfcBeam": {
        "qset": "Qto_BeamBaseQuantities",
        "length": "Length"
    },
    "IfcBuildingElementPart": {
        "qset": "Qto_BuildingElementPartBaseQuantities",
        "area": "GrossArea"
    },
    "IfcBuildingElementProxy": {
        "qset": "Qto_BuildingElementProxyBaseQuantities",
        "area": "GrossArea"
    },
    "IfcColumn": {
        "qset": "Qto_ColumnBaseQuantities",
        "length": "Length"
    },
    "IfcCovering": {
        "qset": "Qto_CoveringBaseQuantities",
        "area": "GrossArea"
    },
    "IfcCurtainWall": {
        "qset": "Qto_CurtainWallBaseQuantities",
        "area": "GrossSideArea"
    },
    "IfcDoor": {
        "qset": "Qto_DoorBaseQuantities",
        "area": "Area"
    },
    "IfcWindow": {
        "qset": "Qto_WindowBaseQuantities",
        "area": "Area"
    },
    "IfcEarthworksCut": {
        "qset": "Qto_EarthworksCutBaseQuantities",
    },
    "IfcFooting": {
        "qset": "Qto_FootingBaseQuantities",
    },
    "IfcMember": {
        "qset": "Qto_MemberBaseQuantities",
    },
    "IfcPile": {
        "qset": "Qto_PileBaseQuantities",
        "area": "GrossSurfaceArea" # Note: Surface Area
    },
    "IfcPlate": {
        "qset": "Qto_PlateBaseQuantities",
        "area": "GrossArea"
    },
    "IfcRampFlight": {
        "qset": "Qto_RampFlightBaseQuantities",
        "area": "GrossArea"
    },
    "IfcSolarDevice": {
        "qset": "Qto_SolarDeviceBaseQuantities",
        "area": "GrossArea"
    },
    "IfcSlab": {
        "qset": "Qto_SlabBaseQuantities",
        "area": "GrossArea"
    },
    "IfcWall": {
        "qset": "Qto_WallBaseQuantities",
        "area": "GrossSideArea"
    },
    # Map StandardCase types to their parent types
    "IfcWallStandardCase": {
        "qset": "Qto_WallBaseQuantities",
        "area": "GrossSideArea"
    },
    "IfcBeamStandardCase": {
        "qset": "Qto_BeamBaseQuantities",
        "length": "Length"
    },
    "IfcColumnStandardCase": {
        "qset": "Qto_ColumnBaseQuantities",
        "length": "Length"
    },
    # Add mappings for other targeted classes if they have standard QTOs
    "IfcCaissonFoundation": {
        "qset": "Qto_FootingBaseQuantities", # Assumption
    },
    "IfcDeepFoundation": {
         "qset": "Qto_PileBaseQuantities", # Assumption
         "area": "GrossSurfaceArea"
    },
    "IfcRailing": {
         "qset": "Qto_RailingBaseQuantities", # Assumption
         "length": "Length"
    },
    "IfcReinforcingBar": {
         "qset": "Qto_ReinforcingBaseQuantities", # Assumption
         "length": "Length" # Check specific name in schema if needed
    },
    "IfcReinforcingElement": { # Generic, might not have specific Qto set
         # Add if specific quantities are known/needed
    },
    "IfcReinforcingMesh": {
         "qset": "Qto_ReinforcingBaseQuantities", # Assumption
         "area": "Area", # Check specific name in schema if needed
    },
    "IfcRoof": {
        "qset": "Qto_RoofBaseQuantities", # Assumption
        "area": "GrossArea", # Or NetArea
    },
    # Add others from TARGET_IFC_CLASSES if needed:
    # IfcBearing, IfcChimney, IfcEarthworksFill, IfcRamp
}

# Helper function to safely get quantity value based on type
def _get_quantity_value(quantity):
    """Extracts the numeric value from an IfcQuantity based on its type."""
    if not quantity:
        return None
    try:
        if quantity.is_a('IfcQuantityLength'):
            return float(quantity.LengthValue)
        elif quantity.is_a('IfcQuantityArea'):
            return float(quantity.AreaValue)
        elif quantity.is_a('IfcQuantityCount'):
            return int(quantity.CountValue)
        elif quantity.is_a('IfcQuantityWeight'):
            return float(quantity.WeightValue)
        # Add other quantity types if needed
    except (AttributeError, ValueError, TypeError) as e:
        # Log the error for debugging?
        # print(f"Could not extract value from quantity {quantity.Name}: {e}")
        pass
    return None 