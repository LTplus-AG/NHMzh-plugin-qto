import ifcopenshell
import ifcopenshell.guid
import logging
import traceback
from typing import List, Dict, Any, Optional, Tuple

# Re-use logger from main module or create a new one
logger = logging.getLogger(__name__)

# Helper function (copied from main)
def _round_value(value, digits=3):
    """Round a value to the specified number of digits."""
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (ValueError, TypeError):
        return value

# Function to get element volume (copied from x.md context / main.py)
# Needs to be available for material volume calculation based on fractions
def get_volume_from_properties(element) -> Dict[str, Optional[float]]:
    """Get volume quantities from base quantities or properties."""
    net_volume = None
    gross_volume = None
    
    if not hasattr(element, 'IsDefinedBy'):
        return {"net": None, "gross": None}

    # First, try to get volumes from base quantities
    for rel_def in element.IsDefinedBy:
        if rel_def.is_a("IfcRelDefinesByProperties"):
            prop_set = rel_def.RelatingPropertyDefinition
            if prop_set.is_a("IfcElementQuantity"):
                for quantity in prop_set.Quantities:
                    if quantity.is_a("IfcQuantityVolume"):
                        try:
                            if quantity.Name == "NetVolume":
                                net_volume = float(quantity.VolumeValue)
                            elif quantity.Name == "GrossVolume":
                                gross_volume = float(quantity.VolumeValue)
                        except (ValueError, AttributeError, TypeError):
                            continue
    
    # If not found in base quantities, try to get from properties
    if net_volume is None and gross_volume is None:
        for rel_def in element.IsDefinedBy:
            if rel_def.is_a("IfcRelDefinesByProperties"):
                prop_set = rel_def.RelatingPropertyDefinition
                if prop_set.is_a("IfcPropertySet"):
                    for prop in prop_set.HasProperties:
                        if prop.is_a("IfcPropertySingleValue") and prop.NominalValue:
                            try:
                                if prop.Name == "NetVolume":
                                    net_volume = float(prop.NominalValue.wrappedValue)
                                elif prop.Name == "GrossVolume":
                                    gross_volume = float(prop.NominalValue.wrappedValue)
                            except (ValueError, AttributeError, TypeError):
                                continue
    
    return {"net": net_volume, "gross": gross_volume}


# Function to compute fractions (copied and adapted from x.md context)
def compute_constituent_fractions(ifc_file, constituent_set, associated_elements, unit_scale_to_mm=1.0) -> Tuple[Dict[Any, float], Dict[Any, float]]:
    """
    Computes fractions for each material constituent based on their widths/volumes.
    
    Returns:
    - A tuple of (fractions, widths) where:
      - fractions: Dictionary mapping each constituent/layer object to its fraction
      - widths: Dictionary mapping each constituent/layer object to its width in mm
    """
    fractions: Dict[Any, float] = {}
    constituent_widths: Dict[Any, float] = {}
    
    # Handle IfcMaterialConstituentSet
    if constituent_set.is_a('IfcMaterialConstituentSet'):
        constituents = constituent_set.MaterialConstituents or []
        if not constituents:
            return {}, {}
        
        # Collect all quantities associated with the elements
        quantities = []
        for element in associated_elements:
            for rel in getattr(element, 'IsDefinedBy', []):
                if rel.is_a('IfcRelDefinesByProperties'):
                    prop_def = rel.RelatingPropertyDefinition
                    if prop_def.is_a('IfcElementQuantity'):
                        quantities.extend(prop_def.Quantities)
        
        # Build a mapping of quantity names to quantities
        quantity_name_map = {}
        for q in quantities:
            if q.is_a('IfcPhysicalComplexQuantity'):
                q_name = (q.Name or '').strip().lower()
                quantity_name_map.setdefault(q_name, []).append(q)
        
        # Handle constituents with duplicate names by order of appearance
        constituent_indices = {}
        total_width_mm = 0.0
        
        # First try to get explicit fractions
        has_explicit_fractions = False
        for constituent in constituents:
            # Try to get fraction from constituent definition
            if hasattr(constituent, 'Fraction') and constituent.Fraction is not None:
                try:
                    fraction = float(constituent.Fraction)
                    fractions[constituent] = fraction
                    has_explicit_fractions = True
                except (ValueError, TypeError):
                    pass # Ignore if fraction is not a valid number
        
        # If any explicit fractions were found, normalize and return them
        if has_explicit_fractions:
            total = sum(fractions.values())
            # Normalize only if total > 0
            if total > 1e-6: # Use small tolerance instead of 0
                norm_fractions = {constituent: fraction / total for constituent, fraction in fractions.items()}
            else: # If total is effectively zero, and we have fractions, distribute equally
                 norm_fractions = {constituent: 1.0 / len(fractions) if fractions else 0 for constituent in constituents }

            # Handle constituents without explicit fractions
            constituents_without_fractions = [c for c in constituents if c not in fractions]
            if constituents_without_fractions:
                 remaining_fraction_sum = 1.0 - sum(norm_fractions.values())
                 if remaining_fraction_sum > 1e-6: # Distribute remaining only if significant
                     equal_fraction = remaining_fraction_sum / len(constituents_without_fractions)
                     for constituent in constituents_without_fractions:
                         norm_fractions[constituent] = equal_fraction
                 else: # If remaining is negligible or negative, set fraction to 0 for these
                     for constituent in constituents_without_fractions:
                         norm_fractions[constituent] = 0.0

            # Ensure final sum is very close to 1.0, re-normalize if needed due to float issues
            final_total = sum(norm_fractions.values())
            if abs(final_total - 1.0) > 1e-6 and final_total > 1e-6 :
                norm_fractions = {c: f / final_total for c, f in norm_fractions.items()}

            # Set widths to 0 since we used explicit fractions
            constituent_widths = {constituent: 0.0 for constituent in constituents}
            return norm_fractions, constituent_widths
        
        # Otherwise, try to get widths from quantities
        for constituent in constituents:
            constituent_name = (constituent.Name or "Unnamed Constituent").strip().lower()
            # Indexing based on order, not just name, for duplicates
            current_index = constituent_indices.get(constituent_name, 0)
            constituent_indices[constituent_name] = current_index + 1
            
            width_mm = 0.0
            # Find quantities matching the name
            quantities_with_name = quantity_name_map.get(constituent_name, [])
            
            # Try to find matching quantity by name and index/order
            if current_index < len(quantities_with_name):
                matched_quantity = quantities_with_name[current_index]
                # Extract 'Width' sub-quantity
                for sub_q in getattr(matched_quantity, 'HasQuantities', []):
                    if sub_q.is_a('IfcQuantityLength') and (sub_q.Name or '').strip().lower() == 'width':
                        try:
                            raw_length_value = getattr(sub_q, 'LengthValue', 0.0)
                            width_mm = float(raw_length_value or 0.0) * unit_scale_to_mm
                            break # Found width for this constituent instance
                        except (ValueError, TypeError):
                            pass
            
            # Fallback: If no width found in complex quantities, try standard quantities by name (less reliable for duplicates)
            if width_mm <= 0.0:
                for quantity in quantities:
                    if quantity.is_a('IfcQuantityLength'):
                        try:
                            quantity_name_lower = (quantity.Name or '').strip().lower()
                            # Simple check if constituent name is in quantity name
                            if quantity_name_lower == constituent_name or constituent_name in quantity_name_lower:
                                width_mm = float(quantity.LengthValue or 0.0) * unit_scale_to_mm
                                # Note: This might incorrectly match if multiple constituents have similar names
                                break # Use first match as fallback
                        except (ValueError, TypeError):
                            pass
            
            constituent_widths[constituent] = width_mm
            total_width_mm += width_mm
        
        # Calculate fractions based on widths
        if total_width_mm > 1e-6: # Use tolerance
            fractions = {constituent: w / total_width_mm for constituent, w in constituent_widths.items()}
        else: # If no width info available or total is zero, distribute equally
            fractions = {constituent: 1.0 / len(constituents) for constituent in constituents}
    
    # Handle IfcMaterialLayerSet or IfcMaterialLayerSetUsage
    elif constituent_set.is_a('IfcMaterialLayerSet') or constituent_set.is_a('IfcMaterialLayerSetUsage'):
        layer_set = constituent_set if constituent_set.is_a('IfcMaterialLayerSet') else getattr(constituent_set, 'ForLayerSet', None)
        
        if not layer_set or not layer_set.MaterialLayers:
            return {}, {}
        
        total_thickness = 0.0
        layers = layer_set.MaterialLayers
        
        # Calculate total thickness from actual values, handle non-numeric thicknesses
        for layer in layers:
            thickness = 0.0
            if hasattr(layer, 'LayerThickness') and layer.LayerThickness is not None:
                try:
                    thickness = float(layer.LayerThickness) * unit_scale_to_mm
                    if thickness < 0: thickness = 0 # Thickness cannot be negative
                except (ValueError, TypeError):
                    thickness = 0.0 # Treat non-numeric as zero thickness
            constituent_widths[layer] = thickness
            total_thickness += thickness

        # Calculate fractions based on layer thickness
        if total_thickness > 1e-6: # Use tolerance
            fractions = {layer: constituent_widths.get(layer, 0) / total_thickness for layer in layers}
        else: # Equal distribution if total thickness is zero or only one layer exists
            if len(layers) > 0:
                fractions = {layer: 1.0 / len(layers) for layer in layers}
            else:
                fractions = {} # No layers, no fractions

    # Normalize final fractions to ensure sum is close to 1.0
    final_total_fraction = sum(fractions.values())
    if abs(final_total_fraction - 1.0) > 1e-6 and final_total_fraction > 1e-6:
        fractions = {obj: f / final_total_fraction for obj, f in fractions.items()}
        
    # Log the final fractions and widths for debugging
    # for item, fraction in fractions.items():
    #     name = "Unknown"
    #     if hasattr(item, 'Material') and item.Material: name = item.Material.Name
    #     elif hasattr(item, 'Name'): name = item.Name
    #     width = constituent_widths.get(item, 0.0)
    #     logger.debug(f"Material/Layer: {name}, Fraction: {fraction:.4f}, Width: {width:.2f} mm")
        
    return fractions, constituent_widths


# Main parsing function for materials
def parse_element_materials(element: ifcopenshell.entity_instance, ifc_file: ifcopenshell.file) -> List[Dict[str, Any]]:
    """
    Parses material information for a single IFC element, handling layers and constituents.

    Args:
        element: The ifcopenshell entity instance (e.g., IfcWall).
        ifc_file: The opened ifcopenshell file object.

    Returns:
        A list of material dictionaries, each containing 'name', 'fraction', and 'volume'.
        Example: [{'name': 'Concrete', 'fraction': 0.8, 'volume': 1.2}, ...]
    """
    materials_list: List[Dict[str, Any]] = []
    processed_material_names = set() # To handle potential duplicates from different associations

    # Get overall element volume first (prefer net volume)
    element_volume_dict = get_volume_from_properties(element)
    element_volume_value = element_volume_dict.get("net")
    if element_volume_value is None:
        element_volume_value = element_volume_dict.get("gross")

    # Default unit scale (can be refined later if needed)
    unit_scale = 1.0 

    if not hasattr(element, "HasAssociations"):
        return []

    for association in element.HasAssociations:
        if association.is_a("IfcRelAssociatesMaterial"):
            relating_material = association.RelatingMaterial
            
            # --- Single Material ---
            if relating_material.is_a("IfcMaterial"):
                material_name = relating_material.Name or "Unnamed Material"
                if material_name not in processed_material_names:
                    materials_list.append({
                        "name": material_name,
                        "fraction": 1.0,
                        "volume": _round_value(element_volume_value, 5) if element_volume_value is not None else None,
                         # No width for single material
                    })
                    processed_material_names.add(material_name)

            # --- Material List (Distribute Equally) ---
            elif relating_material.is_a("IfcMaterialList"):
                materials = relating_material.Materials
                if materials:
                    fraction = 1.0 / len(materials) if len(materials) > 0 else 0
                    for material in materials:
                        material_name = material.Name or "Unnamed Material"
                        unique_name = material_name
                        counter = 1
                        while unique_name in processed_material_names:
                            unique_name = f"{material_name} ({counter})"
                            counter += 1
                        
                        materials_list.append({
                            "name": unique_name,
                            "fraction": _round_value(fraction, 5),
                            "volume": _round_value(element_volume_value * fraction, 5) if element_volume_value is not None else None,
                            # No width info from MaterialList typically
                        })
                        processed_material_names.add(unique_name)

            # --- Layer Set (Usage or Direct) ---
            elif relating_material.is_a("IfcMaterialLayerSetUsage") or relating_material.is_a("IfcMaterialLayerSet"):
                layer_set = relating_material if relating_material.is_a("IfcMaterialLayerSet") else getattr(relating_material, 'ForLayerSet', None)
                if layer_set:
                    constituent_fractions, constituent_widths = compute_constituent_fractions(
                        ifc_file, 
                        layer_set, # Pass the actual LayerSet
                        [element],
                        unit_scale
                    )
                    
                    for layer, fraction in constituent_fractions.items():
                        if hasattr(layer, "Material") and layer.Material:
                            material = layer.Material
                            material_name = material.Name or "Unnamed Layer Material"
                            layer_volume = _round_value(element_volume_value * fraction, 5) if element_volume_value is not None else None
                            layer_width = _round_value(constituent_widths.get(layer), 5) # Get width if calculated

                            unique_name = material_name
                            counter = 1
                            while unique_name in processed_material_names:
                                unique_name = f"{material_name} ({counter})"
                                counter += 1

                            mat_data = {
                                "name": unique_name,
                                "fraction": _round_value(fraction, 5)
                            }
                            if layer_volume is not None:
                                mat_data["volume"] = layer_volume
                            if layer_width is not None and layer_width > 0:
                                mat_data["width"] = layer_width
                                
                            materials_list.append(mat_data)
                            processed_material_names.add(unique_name)

            # --- Constituent Set ---
            elif relating_material.is_a("IfcMaterialConstituentSet"):
                constituent_fractions, constituent_widths = compute_constituent_fractions(
                    ifc_file,
                    relating_material,
                    [element],
                    unit_scale
                )
                
                for constituent, fraction in constituent_fractions.items():
                    if hasattr(constituent, "Material") and constituent.Material:
                        material = constituent.Material
                        material_name = material.Name or "Unnamed Constituent Material"
                        constituent_volume = _round_value(element_volume_value * fraction, 5) if element_volume_value is not None else None
                        constituent_width = _round_value(constituent_widths.get(constituent), 5) # Get width if calculated

                        unique_name = material_name
                        counter = 1
                        while unique_name in processed_material_names:
                             unique_name = f"{material_name} ({counter})"
                             counter += 1

                        mat_data = {
                            "name": unique_name,
                            "fraction": _round_value(fraction, 5)
                        }
                        if constituent_volume is not None:
                            mat_data["volume"] = constituent_volume
                        if constituent_width is not None and constituent_width > 0:
                            mat_data["width"] = constituent_width

                        materials_list.append(mat_data)
                        processed_material_names.add(unique_name)

            # --- Log other material types if necessary ---
            # else:
            #     logger.debug(f"Unhandled material association type for element {element.id()}: {relating_material.is_a()}")
            
            # Break after finding the first valid material association?
            # Usually an element has only one primary material definition.
            # If multiple associations are possible and needed, remove the break.
            # For now, assume the first association is the primary one.
            if materials_list: # If we added materials from this association
                 break

    # Normalize fractions if the sum isn't close to 1.0 (can happen with multiple associations or rounding)
    total_fraction_sum = sum(m.get('fraction', 0) for m in materials_list)
    if abs(total_fraction_sum - 1.0) > 1e-5 and total_fraction_sum > 1e-5:
        logger.debug(f"Normalizing material fractions for element {element.id()}. Initial sum: {total_fraction_sum}")
        for material_item in materials_list:
             material_item['fraction'] = material_item.get('fraction', 0) / total_fraction_sum
             # Recalculate volume based on normalized fraction
             if element_volume_value is not None and 'volume' in material_item:
                 material_item['volume'] = _round_value(element_volume_value * material_item['fraction'], 5)


    if not materials_list:
        logger.debug(f"No processable material associations found for element {element.id()}")

    return materials_list 