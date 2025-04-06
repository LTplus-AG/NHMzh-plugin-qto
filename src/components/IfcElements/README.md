# IFC Elements Components

This directory contains components for working with IFC elements in the plugin-qto project.

## Components

### ElementsHeader

The main component that displays the header for IFC elements, including:

- Element count
- Search field
- Classification filter
- Edited elements status

```tsx
<ElementsHeader
  totalFilteredElements={filteredElements.length}
  targetIfcClasses={targetIfcClasses}
  editedElementsCount={editedElements.length}
  resetEdits={handleResetEdits}
  uniqueClassifications={uniqueClassifications}
  classificationFilter={classificationFilter}
  setClassificationFilter={setClassificationFilter}
  elements={elements} // Pass all elements for search functionality
  onElementSelect={handleElementSelect} // Handle element selection from search
/>
```

### BimObjectSearch

A standalone search component with autocomplete that allows searching for BIM objects by name, properties, level, or other attributes.

```tsx
<BimObjectSearch
  elements={elements}
  onElementSelect={(element) => {
    // Handle element selection
    console.log("Selected element:", element);
  }}
  placeholder="Suche nach Namen, Eigenschaften, Ebene..." // Optional
  width={400} // Optional
/>
```

### ClassificationFilter

A standalone component for filtering elements by classification.

```tsx
<ClassificationFilter
  uniqueClassifications={uniqueClassifications}
  classificationFilter={classificationFilter}
  setClassificationFilter={setClassificationFilter}
/>
```

## Hooks

### useBimSearch

Custom hook that provides search functionality for BIM elements:

```tsx
const {
  inputValue,
  setInputValue,
  selectedElement,
  setSelectedElement,
  open,
  setOpen,
  loading,
  filteredOptions,
  getNoOptionsText,
} = useBimSearch(elements);
```

## Troubleshooting

### Search Doesn't Show Results

If the search doesn't show any results or displays "No elements available":

1. **Check if elements are passed correctly**:

   - Make sure the `elements` array is properly passed to the `ElementsHeader` component
   - Add console logs to verify elements array length: `console.log("ElementsHeader elements:", elements?.length)`

2. **Check element structure**:

   - The component expects elements to have properties like: `id`, `name`, `type`, `level`, etc.
   - Log a sample element to inspect its structure: `console.log("Sample element:", elements[0])`

3. **Type compatibility issues**:
   - Make sure the element type matches `IFCElement` from `types.ts`
   - If you have custom types, ensure they're compatible with what the search component expects

### Element Selection Not Working

If selecting elements from search doesn't work:

1. **Check if `onElementSelect` handler is implemented**:

   - Make sure it expands the correct EBKP group
   - Make sure it expands the selected element row
   - Scrolls to the selected element

2. **Check element row IDs**:
   - Element rows should have an ID attribute formatted as `element-row-${element.id}`
   - This is needed for the scroll-to-element functionality

## Data Flow Diagram

```
IfcElementsList
  ├── elements (IFCElement[])
  │
  ├── ElementsHeader
  │   ├── elements (passed from IfcElementsList)
  │   └── BimObjectSearch
  │       └── useBimSearch (custom hook)
  │
  └── EbkpGroupRow (for each EBKP group)
      └── ElementRow (for each element)
          └── element-row-${id} (for scrolling)
```

## Best Practices Implemented

1. **Separation of Concerns**:

   - Presentation logic in components
   - Data management logic in custom hooks
   - Reusable UI elements (ClassificationFilter, BimObjectSearch)

2. **Performance Optimization**:

   - Efficient filtering with useMemo
   - Limiting result sets to prevent rendering too many items
   - Loading states to provide feedback during search

3. **Enhanced User Experience**:

   - Loading indicators
   - Empty state handling
   - Informative error messages
   - Conditional rendering of elements
   - Responsive design

4. **Accessibility**:
   - Proper ARIA roles via MUI components
   - Clear visual feedback
   - Keyboard navigation support

## Usage Example

In your parent component, you'll need to:

1. Maintain state for elements and selected elements
2. Provide callbacks to handle element selection
3. Update the ElementsHeader props to include elements and selection handler

```tsx
import React, { useState, useEffect } from "react";
import ElementsHeader from "./IfcElements/ElementsHeader";
// For direct use of search
import BimObjectSearch from "./IfcElements/BimObjectSearch";
// For using the hook pattern
import useBimSearch from "./IfcElements/useBimSearch";

const ParentComponent = () => {
  const [elements, setElements] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [classificationFilter, setClassificationFilter] = useState("");

  // Option 1: Load elements and manage selection manually
  useEffect(() => {
    // Example loading function
    const loadElements = async () => {
      const response = await fetchElementsFromAPI();
      setElements(response.data);
    };

    loadElements();
  }, []);

  // Handle element selection from search
  const handleElementSelect = (element) => {
    setSelectedElement(element);
    // Additional logic like scrolling to the element in a list, etc.
  };

  // Option 2: Use custom hook pattern (alternative approach)
  // const {
  //   filteredOptions,
  //   selectedElement,
  //   setSelectedElement,
  //   // ...other hook values
  // } = useBimSearch(elements);

  return (
    <div>
      <ElementsHeader
        totalFilteredElements={elements.length}
        targetIfcClasses={["IfcWall", "IfcSlab", "IfcColumn"]}
        editedElementsCount={0}
        resetEdits={() => {}}
        uniqueClassifications={[]}
        classificationFilter={classificationFilter}
        setClassificationFilter={setClassificationFilter}
        elements={elements}
        onElementSelect={handleElementSelect}
      />

      {/* Alternative: Using BimObjectSearch directly */}
      {/* <BimObjectSearch
        elements={elements}
        onElementSelect={handleElementSelect}
      /> */}

      {/* Display selected element details */}
      {selectedElement && (
        <div>
          <h3>Selected: {selectedElement.name}</h3>
          <p>Type: {selectedElement.element_type}</p>
          {/* Render other element details */}
        </div>
      )}
    </div>
  );
};

export default ParentComponent;
```
