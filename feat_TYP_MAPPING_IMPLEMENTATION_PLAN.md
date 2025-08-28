# eBKP-Mapping für IFC-Elemente

## Executive Summary

Dieses Dokument beschreibt die Implementierung eines Regel-basierten Mapping-Systems im QTO-Plugin für die automatische Zuordnung von eBKP-Codes zu IFC-Elementen.

**Ziel:** Automatische Klassifizierung von IFC-Elementen basierend auf:
- IFC-Klasse (Typ)
- Eigenschaften (IsExternal, IsLoadBearing)
- Gebäudegeschoss (level)
- Materialien

**Beispiele:**
- Alle tragenden Wände → eBKP H01.01
- Alle nicht-tragenden Innenwände → eBKP H01.03
- Alle Wände im Untergeschoss → eBKP H01.05

**Architektur:** Erweiterung des QTO-Backends mit Regel-Engine

## Aktuelle QTO-Architektur

### Verfügbare IFC-Daten für Regel-Mapping

Das QTO-System extrahiert bereits umfangreiche IFC-Daten, die für flexible Regel-Mappings genutzt werden können:

#### Element-Struktur (`qto.elements`)
```javascript
{
  "_id": "ObjectId",
  "global_id": "3DqaUydM99ehywE4_2hm1u",
  "type": "IfcWall",                    // IFC-Klasse für Typ-basierte Regeln
  "name": "Aussenwand_470mm",
  "type_name": "Standard_Wall",         // Aus IfcTypeObject.Name
  "properties": {
    // Häufige Property-Sets für Wände
    "Pset_WallCommon.IsExternal": "True",
    "Pset_WallCommon.IsLoadBearing": "False",
    "Pset_WallCommon.PredefinedType": "STANDARD",
    "Pset_WallCommon.FireRating": "F30",
    "Pset_WallCommon.Combustible": "False",

    // Andere Property-Sets
    "Pset_EnvironmentalImpactValues.GlobalWarmingPotential": "125.5",
    "Pset_MaterialCommon.Material": "Concrete",
    "Pset_QuantityArea.GrossArea": "15.2"
  },
  "classification": {
    "id": "H01.02",                    // eBKP-Code (falls vorhanden)
    "name": "Aussenwandkonstruktion",
    "system": "eBKP"
  },
  "materials": [...],                  // Material-Informationen
  "area": 15.2,                        // Berechnete Fläche
  "volume": null                       // Berechnetes Volumen
}
```

#### Verfügbare IFC-Properties für Regel-Mapping

**Basis-Properties:**
- `type` - IFC-Klasse (IfcWall, IfcSlab, etc.)
- `level` - Gebäudegeschoss (EG, U1.UG_RDOK, etc.)
- `properties.Pset_WallCommon.IsLoadBearing` - Tragend/Nicht-tragend
- `properties.Pset_WallCommon.IsExternal` - Aussen/Innen
- `materials[].name` - Materialname (genaue Übereinstimmung)

#### Properties-Extraktion (bereits implementiert)
```python
# Alle IFC-Property-Sets werden extrahiert (main.py Zeilen 454-468)
if property_set.is_a('IfcPropertySet'):
    pset_name = property_set.Name or "PropertySet"
    for prop in property_set.HasProperties:
        if prop.is_a('IfcPropertySingleValue') and prop.NominalValue:
            prop_name = f"{pset_name}.{prop.Name}"
            prop_value = str(prop.NominalValue.wrappedValue)
            element_data["properties"][prop_name] = prop_value
```

## Technische Spezifikation

### Neue Datenbank-Collection: `mappingRules`

```javascript
// qto.mappingRules - Einfache Struktur für Initial Version
{
  "_id": "ObjectId",
  "project_id": "ObjectId",           // Projekt-Referenz
  "name": "Tragende Wände",           // Regel-Name
  "conditions": [                     // Array von Bedingungen (AND-verknüpft)
    {
      "property": "type",             // Feld-Name oder Property-Pfad
      "operator": "equals",           // equals, not_equals
      "value": "IfcWall"              // Vergleichswert
    },
    {
      "property": "properties.Pset_WallCommon.IsLoadBearing",
      "operator": "equals",
      "value": "True"
    }
  ],
  "ebkp_code": "H01.01",              // Ziel-eBKP-Code
  "quantity_type": "area",            // area, length, volume
  "is_active": true,                  // Regel aktiv/inaktiv
  "created_at": "ISODate"
}

// Beispiel-Regeln mit Prioritäten:
{
  "name": "Spezifische tragende Untergeschoss-Wände",
  "conditions": [
    {"property": "type", "operator": "equals", "value": "IfcWall"},
    {"property": "properties.Pset_WallCommon.IsLoadBearing", "operator": "equals", "value": "True"},
    {"property": "level", "operator": "equals", "value": "U1.UG_RDOK"}
  ],
  "ebkp_code": "H01.01",
  "quantity_type": "area",
  "priority": 15,  // Hohe Priorität für spezifische Regeln
  "is_active": true
}

{
  "name": "Alle tragenden Wände",
  "conditions": [
    {"property": "type", "operator": "equals", "value": "IfcWall"},
    {"property": "properties.Pset_WallCommon.IsLoadBearing", "operator": "equals", "value": "True"}
  ],
  "ebkp_code": "H01.02",
  "quantity_type": "area",
  "priority": 10,  // Normale Priorität
  "is_active": true
}

{
  "name": "Alle Wände",
  "conditions": [
    {"property": "type", "operator": "equals", "value": "IfcWall"}
  ],
  "ebkp_code": "H01.03",
  "quantity_type": "area",
  "priority": 5,   // Niedrige Priorität für allgemeine Regeln
  "is_active": true
}
```

### Rule Engine Architektur

#### 1. Regel-Evaluator
```python
class RuleEvaluator:
    """Regel-Evaluator"""

    def __init__(self, db):
        self.db = db

    def evaluate_element(self, element_data, project_id):
        """Wendet erste passende Regel auf Element an (nach Priorität sortiert)"""
        rules = self._get_active_rules(project_id)

        # Sortiere nach Priorität (höchste zuerst)
        rules.sort(key=lambda r: r.get('priority', 10), reverse=True)

        for rule in rules:
            if self._rule_matches(element_data, rule):
                return self._apply_rule(element_data, rule)

        return element_data  # Keine Regel traf zu

    def _rule_matches(self, element_data, rule):
        """Prüft ob alle Bedingungen erfüllt sind"""
        conditions = rule.get('conditions', [])

        for condition in conditions:
            if not self._condition_matches(element_data, condition):
                return False

        return True

    def _condition_matches(self, element_data, condition):
        """Prüft einzelne Bedingung"""
        property_path = condition['property']
        operator = condition['operator']
        expected_value = condition['value']

        # Hole Property-Wert
        actual_value = self._get_property_value(element_data, property_path)

        # Einfache Operatoren für Initial Version
        if operator == 'equals':
            return str(actual_value) == str(expected_value)
        elif operator == 'not_equals':
            return str(actual_value) != str(expected_value)

        return False

    def _get_property_value(self, element_data, property_path):
        """Extrahiert Wert aus Element-Daten"""
        if '.' not in property_path:
            return element_data.get(property_path)

        # Navigation durch nested Properties
        parts = property_path.split('.')
        current = element_data

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current

    def _get_active_rules(self, project_id):
        """Lädt alle aktiven Regeln für ein Projekt"""
        return list(self.db.mappingRules.find({
            "project_id": ObjectId(project_id),
            "is_active": True
        }))

    def _apply_rule(self, element_data, rule):
        """Wendet Regel auf Element an"""
        # Klassifizierung setzen
        element_data["classification"] = {
            "id": rule["ebkp_code"],
            "system": "eBKP",
            "source": "mapping_rule",
            "rule_name": rule["name"]
        }

        return element_data
```

#### 2. Property-Analyzer
```python
class PropertyAnalyzer:
    """Property-Analyzer für verfügbare Eigenschaften"""

    COMMON_PROPERTIES = {
        "type": "IFC-Klasse",
        "level": "Gebäudegeschoss",
        "properties.Pset_WallCommon.IsLoadBearing": "Tragend",
        "properties.Pset_WallCommon.IsExternal": "Aussen/Innen",
        "materials[].name": "Materialname"
    }

    def __init__(self, db):
        self.db = db

    def get_available_properties(self, project_id):
        """Gibt verfügbare Properties für Projekt zurück"""
        # Hole ein Beispiel-Element für Property-Entdeckung
        sample_element = self.db.elements.find_one({"project_id": ObjectId(project_id)})
        if not sample_element:
            return []

        available_properties = []
        for property_path, display_name in self.COMMON_PROPERTIES.items():
            # Prüfe ob Property in Element existiert
            value = self._get_property_value(sample_element, property_path)
            if value is not None:
                available_properties.append({
                    "path": property_path,
                    "name": display_name
                })

        return available_properties

    def _get_property_value(self, element_data, property_path):
        """Extrahiert Wert aus Element-Daten"""
        if '.' not in property_path:
            return element_data.get(property_path)

        parts = property_path.split('.')
        current = element_data

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return None

        return current
```

## Implementierungsplan

### 1. Backend-Architektur

#### 1.1 Datenmodelle und MongoDB-Schema
```python
class MappingCondition(BaseModel):
    property: str  # Property-Pfad (z.B. "type" oder "properties.Pset_WallCommon.IsLoadBearing")
    operator: str  # Vergleichsoperator ("equals", "not_equals")
    value: str     # Erwarteter Wert

class MappingRule(BaseModel):
    project_id: str
    name: str
    conditions: List[MappingCondition]
    ebkp_code: str
    quantity_type: str  # 'area', 'length', 'volume'
    priority: int = 10  # Höherer Wert = höhere Priorität
    is_active: bool = True
    created_at: datetime
```
```

#### 1.2 MongoDB-Collection: `mappingRules`
```javascript
db.createCollection("mappingRules");

// Index für Performance (mit Priority für Sortierung)
db.mappingRules.createIndex({ "project_id": 1, "is_active": 1, "priority": -1 });
```

#### 1.3 API-Endpunkte
```python
# API-Endpunkte

@app.get("/projects/{project_name}/available-properties")
async def get_available_properties(project_name: str, db=Depends(get_db)):
    """Gibt verfügbare Properties für Regel-Erstellung zurück"""
    analyzer = PropertyAnalyzer(db)
    project_id = await get_project_id(project_name, db)
    properties = analyzer.get_available_properties(str(project_id))
    return {"properties": properties}

@app.get("/projects/{project_name}/mapping-rules")
async def get_mapping_rules(project_name: str, db=Depends(get_db)):
    """Gibt alle Mapping-Regeln für Projekt zurück"""
    rules = list(db.mappingRules.find({"project_id": await get_project_id(project_name, db)}))
    return {"rules": rules}

@app.post("/projects/{project_name}/mapping-rules")
async def create_mapping_rule(rule: MappingRule, project_name: str, db=Depends(get_db)):
    """Erstellt neue Mapping-Regel"""
    rule.project_id = str(await get_project_id(project_name, db))
    rule.created_at = datetime.now()

    result = db.mappingRules.insert_one(rule.dict())
    return {"rule_id": str(result.inserted_id)}

@app.put("/projects/{project_name}/mapping-rules/{rule_id}")
async def update_mapping_rule(rule_id: str, rule: MappingRule, project_name: str, db=Depends(get_db)):
    """Aktualisiert Mapping-Regel"""
    db.mappingRules.update_one(
        {"_id": ObjectId(rule_id)},
        {"$set": rule.dict()}
    )
    return {"rule_id": rule_id}

@app.delete("/projects/{project_name}/mapping-rules/{rule_id}")
async def delete_mapping_rule(rule_id: str, project_name: str, db=Depends(get_db)):
    """Löscht Mapping-Regel"""
    db.mappingRules.delete_one({"_id": ObjectId(rule_id)})
    return {"deleted": True}
```

### 2. Regel-Engine Integration

#### 2.1 Erweiterte Klassifizierungslogik
```python
# main.py - Integration der Regel-Engine in bestehende Klassifizierung
def apply_mapping_rules_if_needed(element_data, project_id, db):
    """Wendet Mapping-Regeln an falls kein eBKP-Code vorhanden"""
    if element_data.get("classification", {}).get("id"):
        return element_data  # Bereits klassifiziert

    # Regel-Engine initialisieren
    evaluator = RuleEvaluator(db)

    # Regel auf Element anwenden
    updated_element = evaluator.evaluate_element(element_data, project_id)

    if updated_element != element_data:
        logger.info(f"Applied mapping rule for {element_data['global_id']}: {updated_element['classification']['rule_name']} -> {updated_element['classification']['id']}")

    return updated_element
```

#### 2.2 Integration in bestehende Pipeline
```python
# main.py - Integration nach Properties-Extraktion (nach Zeile 615)
# Bestehende Klassifizierungslogik bleibt erhalten, Regel-Engine wird zusätzlich angewendet

# 1. Bestehende IFC-Klassifizierung (Associations, Properties)
# ... existing classification logic ...

# 2. Apply mapping rules if no classification found
element_data = apply_mapping_rules_if_needed(element_data, project_id, mongodb.db)
```

#### 2.3 Property-Analyzer für Regel-Erstellung
```python
# utils/property_analyzer.py
class PropertyAnalyzer:
    """Analysiert verfügbare Properties für Regel-Erstellung"""

    COMMON_PROPERTIES = {
        "type": "IFC-Klasse",
        "properties.Pset_WallCommon.IsLoadBearing": "Tragend",
        "properties.Pset_WallCommon.IsExternal": "Aussen/Innen",
        "properties.Pset_WallCommon.PredefinedType": "PredefinedType",
        "properties.Pset_WallCommon.FireRating": "Feuerwiderstand",
        "properties.Pset_ColumnCommon.IsLoadBearing": "Tragend (Stützen)",
        "properties.Pset_SlabCommon.IsExternal": "Aussen/Innen (Decken)",
        "properties.Pset_DoorCommon.DoorType": "Türtyp",
        "properties.Pset_WindowCommon.WindowType": "Fenstertyp",
        # Spatial Data
        "level": "Gebäudegeschoss",
        # Material Data (wird automatisch aus materials[].name extrahiert)
    }

    def __init__(self, db):
        self.db = db

    async def analyze_project_properties(self, project_name):
        """Analysiert alle verfügbaren Properties in einem Projekt"""
        project_id = await self._get_project_id(project_name)

        # Aggregation aller Properties
        pipeline = [
            {"$match": {"project_id": ObjectId(project_id)}},
            {"$group": {
                "_id": None,
                "elements": {"$push": "$$ROOT"}
            }}
        ]

        result = list(self.db.elements.aggregate(pipeline))
        if not result:
            return {"properties": []}

        elements = result[0]["elements"]

        # Properties analysieren
        property_analysis = []

        # Bekannte Properties analysieren
        for property_path, display_name in self.COMMON_PROPERTIES.items():
            analysis = self._analyze_property(elements, property_path, display_name)
            if analysis:
                property_analysis.append(analysis)

        # Weitere Properties finden und analysieren
        additional_properties = self._find_additional_properties(elements)
        for property_path, display_name in additional_properties.items():
            if property_path not in self.COMMON_PROPERTIES:
                analysis = self._analyze_property(elements, property_path, display_name)
                if analysis:
                    property_analysis.append(analysis)

        return {"properties": property_analysis}

    def _analyze_property(self, elements, property_path, display_name):
        """Analysiert eine einzelne Property über alle Elemente"""
        values = []

        for element in elements:
            value = self._get_property_value(element, property_path)
            if value is not None:
                values.append(str(value))

        if not values:
            return None

        # Wert-Verteilung berechnen
        value_counts = {}
        total_count = len(values)

        for value in values:
            value_counts[value] = value_counts.get(value, 0) + 1

        # In Analyse-Format konvertieren
        analysis_values = []
        for value, count in value_counts.items():
            analysis_values.append({
                "value": value,
                "count": count,
                "percentage": round((count / total_count) * 100, 1)
            })

        # Nach Häufigkeit sortieren
        analysis_values.sort(key=lambda x: x["count"], reverse=True)

        return {
            "path": property_path,
            "name": display_name,
            "values": analysis_values
        }


```

### 3. Frontend für regel-basiertes Mapping

#### 3.1 Haupt-Komponente: MappingRuleManager
```typescript
// src/components/MappingRuleManager.tsx
interface MappingRuleManagerProps {
  projectId: string;
  onRuleChange: () => void;
}

export const MappingRuleManager: React.FC<MappingRuleManagerProps> = ({
  projectId,
  onRuleChange
}) => {
  const [rules, setRules] = useState<MappingRule[]>([]);
  const [propertyAnalysis, setPropertyAnalysis] = useState<PropertyAnalysis[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);

  useEffect(() => {
    loadRules();
    loadPropertyAnalysis();
  }, [projectId]);

  const loadRules = async () => {
    const response = await fetch(`/api/projects/${projectId}/mapping-rules`);
    const data = await response.json();
    setRules(data.rules);
  };

  const loadPropertyAnalysis = async () => {
    const response = await fetch(`/api/projects/${projectId}/property-analysis`);
    const data = await response.json();
    setPropertyAnalysis(data.properties);
  };

  const createRule = async (ruleData: Partial<MappingRule>) => {
    await fetch(`/api/projects/${projectId}/mapping-rules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ruleData)
    });
    await loadRules();
    onRuleChange();
    setShowCreateForm(false);
  };

  const testRule = async (ruleData: Partial<MappingRule>) => {
    const response = await fetch(`/api/projects/${projectId}/mapping-rules/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ruleData)
    });
    return await response.json();
  };

  return (
    <div className="mapping-rule-manager">
      <div className="header">
        <h3>eBKP-Mapping-Regeln</h3>
        <Button onClick={() => setShowCreateForm(true)}>
          <PlusIcon /> Neue Regel
        </Button>
      </div>

      {/* Property-Übersicht für Regel-Erstellung */}
      <PropertyOverview
        properties={propertyAnalysis}
        onPropertySelect={(property) => {
          // Neue Regel mit dieser Property starten
          setShowCreateForm(true);
          // Pre-fill form with selected property
        }}
      />

      {/* Bestehende Regeln */}
      <div className="rules-list">
        {rules.map(rule => (
          <RuleCard
            key={rule._id}
            rule={rule}
            onUpdate={loadRules}
            onDelete={loadRules}
            onTest={testRule}
          />
        ))}
      </div>

      {/* Regel-Erstellungs-Modal */}
      {showCreateForm && (
        <RuleCreateModal
          projectId={projectId}
          properties={propertyAnalysis}
          onSubmit={createRule}
          onCancel={() => setShowCreateForm(false)}
          onTest={testRule}
        />
      )}
    </div>
  );
};
```

#### 3.2 Property-Übersicht Komponente
```typescript
// src/components/PropertyOverview.tsx
interface PropertyOverviewProps {
  properties: PropertyAnalysis[];
  onPropertySelect: (property: PropertyAnalysis) => void;
}

export const PropertyOverview: React.FC<PropertyOverviewProps> = ({
  properties,
  onPropertySelect
}) => {
  return (
    <Card className="property-overview">
      <CardHeader>
        <h4>Verfügbare Properties für Regel-Erstellung</h4>
        <p>Klicken Sie auf eine Property um eine Regel zu erstellen</p>
      </CardHeader>
      <CardContent>
        <div className="properties-grid">
          {properties.map(property => (
            <PropertyCard
              key={property.path}
              property={property}
              onSelect={() => onPropertySelect(property)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

const PropertyCard: React.FC<{
  property: PropertyAnalysis;
  onSelect: () => void;
}> = ({ property, onSelect }) => {
  return (
    <Card className="property-card" onClick={onSelect}>
      <CardHeader>
        <h5>{property.name}</h5>
        <Badge variant="outline">{property.path}</Badge>
      </CardHeader>
      <CardContent>
        <div className="value-distribution">
          {property.values.slice(0, 5).map((value, index) => (
            <div key={index} className="value-item">
              <span className="value">{value.value}</span>
              <Badge variant="secondary">{value.count} ({value.percentage}%)</Badge>
            </div>
          ))}
          {property.values.length > 5 && (
            <div className="more-values">
              +{property.values.length - 5} weitere Werte
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

#### 3.3 Regel-Erstellungs-Modal
```typescript
// src/components/RuleCreateModal.tsx
interface RuleCreateModalProps {
  projectId: string;
  properties: PropertyAnalysis[];
  onSubmit: (rule: Partial<MappingRule>) => Promise<void>;
  onCancel: () => void;
  onTest: (rule: Partial<MappingRule>) => Promise<any>;
}

export const RuleCreateModal: React.FC<RuleCreateModalProps> = ({
  projectId,
  properties,
  onSubmit,
  onCancel,
  onTest
}) => {
  const [rule, setRule] = useState<Partial<MappingRule>>({
    name: '',
    description: '',
    priority: 10,
    conditions: [{ property: '', operator: 'equals', value: '' }],
    action: { ebkp_code: '', quantity_type: 'area', kennwert_override: null },
    is_active: true
  });
  const [testResults, setTestResults] = useState<any>(null);

  const addCondition = () => {
    setRule(prev => ({
      ...prev,
      conditions: [...(prev.conditions || []), { property: '', operator: 'equals', value: '' }]
    }));
  };

  const updateCondition = (index: number, condition: any) => {
    setRule(prev => ({
      ...prev,
      conditions: (prev.conditions || []).map((c, i) => i === index ? condition : c)
    }));
  };

  const removeCondition = (index: number) => {
    setRule(prev => ({
      ...prev,
      conditions: (prev.conditions || []).filter((_, i) => i !== index)
    }));
  };

  const handleTest = async () => {
    const results = await onTest(rule);
    setTestResults(results);
  };

  const handleSubmit = async () => {
    await onSubmit(rule);
  };

  return (
    <Modal open={true} onClose={onCancel} size="large">
      <ModalHeader>
        <h3>Neue Mapping-Regel erstellen</h3>
      </ModalHeader>

      <ModalBody>
        <div className="rule-form">
          {/* Grunddaten */}
          <div className="form-section">
            <h4>Regel-Details</h4>
            <FormField label="Name">
              <Input
                value={rule.name}
                onChange={(e) => setRule(prev => ({ ...prev, name: e.target.value }))}
                placeholder="z.B. Tragende Wände"
              />
            </FormField>
            <FormField label="Beschreibung">
              <Textarea
                value={rule.description}
                onChange={(e) => setRule(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optionale Beschreibung der Regel"
              />
            </FormField>
            <FormField label="Priorität">
              <Select
                value={rule.priority}
                onChange={(value) => setRule(prev => ({ ...prev, priority: Number(value) }))}
              >
                <option value={1}>Höchste Priorität</option>
                <option value={5}>Hohe Priorität</option>
                <option value={10}>Normale Priorität</option>
                <option value={15}>Niedrige Priorität</option>
              </Select>
            </FormField>
          </div>

          {/* Bedingungen */}
          <div className="form-section">
            <div className="section-header">
              <h4>Bedingungen (Alle müssen erfüllt sein)</h4>
              <Button variant="outline" size="sm" onClick={addCondition}>
                <PlusIcon /> Bedingung hinzufügen
              </Button>
            </div>

            {rule.conditions?.map((condition, index) => (
              <ConditionBuilder
                key={index}
                condition={condition}
                properties={properties}
                onUpdate={(updated) => updateCondition(index, updated)}
                onRemove={() => removeCondition(index)}
                showRemove={rule.conditions!.length > 1}
              />
            ))}
          </div>

          {/* Aktion */}
          <div className="form-section">
            <h4>Aktion (Bei Regel-Treffer)</h4>
            <div className="action-builder">
              <FormField label="eBKP-Code">
                <EbkpCodeSelector
                  value={rule.action?.ebkp_code || ''}
                  onChange={(code) => setRule(prev => ({
                    ...prev,
                    action: { ...prev.action!, ebkp_code: code }
                  }))}
                />
              </FormField>
              <FormField label="Mengentyp">
                <Select
                  value={rule.action?.quantity_type || 'area'}
                  onChange={(value) => setRule(prev => ({
                    ...prev,
                    action: { ...prev.action!, quantity_type: value }
                  }))}
                >
                  <option value="area">Fläche (m²)</option>
                  <option value="length">Länge (m)</option>
                  <option value="volume">Volumen (m³)</option>
                </Select>
              </FormField>
              <FormField label="Kennwert-Override (optional)">
                <Input
                  type="number"
                  value={rule.action?.kennwert_override || ''}
                  onChange={(e) => setRule(prev => ({
                    ...prev,
                    action: { ...prev.action!, kennwert_override: e.target.value ? Number(e.target.value) : null }
                  }))}
                  placeholder="z.B. 125.50"
                />
              </FormField>
            </div>
          </div>

          {/* Test-Bereich */}
          <div className="form-section">
            <div className="section-header">
              <h4>Regel testen</h4>
              <Button variant="outline" onClick={handleTest}>
                Gegen vorhandene Elemente testen
              </Button>
            </div>

            {testResults && (
              <Card className="test-results">
                <h5>Test-Ergebnisse</h5>
                <p><strong>{testResults.matched_count}</strong> Elemente würden auf diese Regel passen:</p>
                <div className="sample-matches">
                  {testResults.sample_matches?.slice(0, 5).map((match: any, index: number) => (
                    <div key={index} className="match-item">
                      <Badge variant="outline">{match.type}</Badge>
                      <span>{match.name}</span>
                      <small>{match.global_id}</small>
                    </div>
                  ))}
                  {testResults.sample_matches?.length > 5 && (
                    <div className="more-matches">
                      ... und {testResults.sample_matches.length - 5} weitere
                    </div>
                  )}
                </div>
              </Card>
            )}
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="outline" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button onClick={handleSubmit}>
          Regel erstellen
        </Button>
      </ModalFooter>
    </Modal>
  );
};
```

#### 3.4 ConditionBuilder Komponente
```typescript
// src/components/ConditionBuilder.tsx
interface ConditionBuilderProps {
  condition: any;
  properties: PropertyAnalysis[];
  onUpdate: (condition: any) => void;
  onRemove: () => void;
  showRemove: boolean;
}

export const ConditionBuilder: React.FC<ConditionBuilderProps> = ({
  condition,
  properties,
  onUpdate,
  onRemove,
  showRemove
}) => {
  const operators = [
    { value: 'equals', label: 'ist gleich' },
    { value: 'not_equals', label: 'ist nicht gleich' },
    { value: 'contains', label: 'enthält' },
    { value: 'starts_with', label: 'beginnt mit' },
    { value: 'greater_than', label: 'grösser als' },
    { value: 'less_than', label: 'kleiner als' }
  ];

  const selectedProperty = properties.find(p => p.path === condition.property);

  return (
    <Card className="condition-builder">
      <CardContent>
        <div className="condition-row">
          {/* Property-Auswahl */}
          <FormField label="Property">
            <Select
              value={condition.property}
              onChange={(value) => onUpdate({ ...condition, property: value })}
            >
              <option value="">Property auswählen...</option>
              {properties.map(property => (
                <option key={property.path} value={property.path}>
                  {property.name} ({property.path})
                </option>
              ))}
            </Select>
          </FormField>

          {/* Operator-Auswahl */}
          <FormField label="Operator">
            <Select
              value={condition.operator}
              onChange={(value) => onUpdate({ ...condition, operator: value })}
            >
              {operators.map(op => (
                <option key={op.value} value={op.value}>
                  {op.label}
                </option>
              ))}
            </Select>
          </FormField>

          {/* Wert-Eingabe */}
          <FormField label="Wert">
            {selectedProperty ? (
              <Select
                value={condition.value}
                onChange={(value) => onUpdate({ ...condition, value })}
              >
                <option value="">Wert auswählen...</option>
                {selectedProperty.values.map((value, index) => (
                  <option key={index} value={value.value}>
                    {value.value} ({value.count}x)
                  </option>
                ))}
              </Select>
            ) : (
              // Spezielle Eingabe für Material-Pattern
              condition.property === "materials[].name" && condition.operator === "starts_with" ? (
                <div className="material-pattern-input">
                  <Input
                    value={condition.value}
                    onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
                    placeholder="z.B. Beton_, Holz_, Stahl_"
                  />
                  <small>Häufige Patterns: Beton_, Holz_, Stahl_, Glas_, etc.</small>
                </div>
              ) : (
                <Input
                  value={condition.value}
                  onChange={(e) => onUpdate({ ...condition, value: e.target.value })}
                  placeholder="Wert eingeben..."
                />
              )
            )}
          </FormField>

          {/* Entfernen-Button */}
          {showRemove && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRemove}
              className="remove-condition"
            >
              <XIcon />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

#### 3.5 Integration in QTO-UI
```typescript
// src/pages/ProjectPage.tsx
const ProjectPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('elements');

  return (
    <div className="project-page">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="elements">Elemente</TabsTrigger>
          <TabsTrigger value="materials">Materialien</TabsTrigger>
          <TabsTrigger value="mappings">eBKP-Mappings</TabsTrigger>
        </TabsList>

        <TabsContent value="mappings">
          <MappingRuleManager
            projectId={projectId}
            onRuleChange={() => {
              // Elemente neu laden und aktualisieren
              loadElements();
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
```

## Testing-Strategie

### Unit Tests für Rule Engine
```python
# tests/test_rule_engine.py
def test_rule_evaluator_simple_condition():
    """Test einfache Regel mit einer Bedingung"""
    db = Mock()
    evaluator = RuleEvaluator(db)

    # Regel: Alle IfcWall-Elemente bekommen H01.01
    rule = {
        "name": "Alle Wände",
        "conditions": [
            {"property": "type", "operator": "equals", "value": "IfcWall"}
        ],
        "action": {"ebkp_code": "H01.01", "quantity_type": "area"}
    }

    element_data = {
        "type": "IfcWall",
        "name": "Test Wall",
        "properties": {}
    }

    result = evaluator.evaluate_element(element_data, "project123")
    assert result["classification"]["id"] == "H01.01"
    assert result["classification"]["source"] == "mapping_rule"

def test_rule_evaluator_complex_condition():
    """Test komplexe Regel mit mehreren Bedingungen"""
    db = Mock()
    evaluator = RuleEvaluator(db)

    rule = {
        "name": "Tragende Aussenwände",
        "conditions": [
            {"property": "type", "operator": "equals", "value": "IfcWall"},
            {"property": "properties.Pset_WallCommon.IsLoadBearing", "operator": "equals", "value": "True"},
            {"property": "properties.Pset_WallCommon.IsExternal", "operator": "equals", "value": "True"}
        ],
        "action": {"ebkp_code": "H01.01", "quantity_type": "area"}
    }

    # Element erfüllt alle Bedingungen
    element_data = {
        "type": "IfcWall",
        "properties": {
            "Pset_WallCommon.IsLoadBearing": "True",
            "Pset_WallCommon.IsExternal": "True"
        }
    }

    result = evaluator.evaluate_element(element_data, "project123")
    assert result["classification"]["id"] == "H01.01"

def test_rule_evaluator_no_match():
    """Test wenn keine Regel zutrifft"""
    db = Mock()
    db.mappingRules.find.return_value = []
    evaluator = RuleEvaluator(db)

    element_data = {"type": "IfcWall"}
    result = evaluator.evaluate_element(element_data, "project123")

    # Element sollte unverändert bleiben
    assert result == element_data

def test_condition_matching():
    """Test verschiedene Vergleichsoperatoren"""
    evaluator = RuleEvaluator(None)

    # Test equals
    condition = {"property": "type", "operator": "equals", "value": "IfcWall"}
    assert evaluator._condition_matches({"type": "IfcWall"}, condition) == True
    assert evaluator._condition_matches({"type": "IfcSlab"}, condition) == False

    # Test contains
    condition = {"property": "name", "operator": "contains", "value": "Wall"}
    assert evaluator._condition_matches({"name": "Exterior Wall"}, condition) == True
    assert evaluator._condition_matches({"name": "Floor"}, condition) == False

def test_property_value_extraction():
    """Test Extraktion von verschachtelten Property-Werten"""
    evaluator = RuleEvaluator(None)

    element_data = {
        "properties": {
            "Pset_WallCommon.IsExternal": "True",
            "Pset_MaterialCommon.Material": "Concrete"
        },
        "level": "U1.UG_RDOK",
        "materials": [
            {"name": "Beton_C35/45", "fraction": 0.8},
            {"name": "Stahl_B500", "fraction": 0.2}
        ]
    }

    # Einfache Property
    assert evaluator._get_property_value(element_data, "properties.Pset_WallCommon.IsExternal") == "True"

    # Spatial Data
    assert evaluator._get_property_value(element_data, "level") == "U1.UG_RDOK"

    # Material Array
    material_names = evaluator._get_property_value(element_data, "materials[].name")
    assert isinstance(material_names, list)
    assert "Beton_C35/45" in material_names
    assert "Stahl_B500" in material_names

    # Property die nicht existiert
    assert evaluator._get_property_value(element_data, "properties.Pset_NonExistent.Test") is None

def test_material_pattern_matching():
    """Test Material-Pattern-Matching"""
    evaluator = RuleEvaluator(None)

    element_data = {
        "materials": [
            {"name": "Beton_C35/45", "fraction": 0.8},
            {"name": "Stahl_B500", "fraction": 0.2}
        ]
    }

    # Test "starts_with" für Materialien
    condition = {"property": "materials[].name", "operator": "starts_with", "value": "Beton_"}
    assert evaluator._condition_matches(element_data, condition) == True

    condition = {"property": "materials[].name", "operator": "starts_with", "value": "Holz_"}
    assert evaluator._condition_matches(element_data, condition) == False

    # Test "contains" für Materialien
    condition = {"property": "materials[].name", "operator": "contains", "value": "C35"}
    assert evaluator._condition_matches(element_data, condition) == True

def test_spatial_data_matching():
    """Test Spatial Data Matching"""
    evaluator = RuleEvaluator(None)

    element_data = {
        "level": "U1.UG_RDOK",
        "type": "IfcWall"
    }

    # Test Geschoss-Matching
    condition = {"property": "level", "operator": "equals", "value": "U1.UG_RDOK"}
    assert evaluator._condition_matches(element_data, condition) == True

    condition = {"property": "level", "operator": "equals", "value": "EG"}
    assert evaluator._condition_matches(element_data, condition) == False

    # Test Pattern-Matching für Geschosse
    condition = {"property": "level", "operator": "starts_with", "value": "U"}
    assert evaluator._condition_matches(element_data, condition) == True
```

### Integration Tests für Regel-System
```python
# tests/test_integration.py
def test_full_rule_mapping_workflow(client, db):
    """Vollständiger Workflow-Test für regel-basiertes Mapping"""

    # 1. Property-Analyse abrufen
    response = client.get("/projects/test-project/property-analysis")
    assert response.status_code == 200
    properties = response.json()["properties"]
    assert len(properties) > 0

    # 2. Regel erstellen
    rule_data = {
        "name": "Test Regel: Alle Wände",
        "description": "Alle Wände bekommen H01.01",
        "priority": 10,
        "conditions": [
            {
                "property": "type",
                "operator": "equals",
                "value": "IfcWall"
            }
        ],
        "action": {
            "ebkp_code": "H01.01",
            "quantity_type": "area",
            "kennwert_override": None
        },
        "is_active": True
    }

    response = client.post("/projects/test-project/mapping-rules", json=rule_data)
    assert response.status_code == 201
    rule_id = response.json()["rule_id"]

    # 3. Regel abrufen und validieren
    response = client.get("/projects/test-project/mapping-rules")
    assert response.status_code == 200
    rules = response.json()["rules"]
    assert len([r for r in rules if r["_id"] == rule_id]) == 1

    # 4. Regel testen
    test_response = client.post("/projects/test-project/mapping-rules/test", json=rule_data)
    assert test_response.status_code == 200
    test_results = test_response.json()
    assert "matched_count" in test_results

    # 5. Regel aktualisieren
    updated_rule = rule_data.copy()
    updated_rule["name"] = "Aktualisierte Test Regel"
    response = client.put(f"/projects/test-project/mapping-rules/{rule_id}", json=updated_rule)
    assert response.status_code == 200

    # 6. Regel löschen
    response = client.delete(f"/projects/test-project/mapping-rules/{rule_id}")
    assert response.status_code == 200

def test_rule_priority_system(client, db):
    """Test Prioritäts-System bei mehreren Regeln"""

    # Regel mit hoher Priorität (niedriger Wert)
    high_priority_rule = {
        "name": "Hohe Priorität: Spezifische Wände",
        "priority": 5,
        "conditions": [
            {"property": "type", "operator": "equals", "value": "IfcWall"},
            {"property": "properties.Pset_WallCommon.IsExternal", "operator": "equals", "value": "True"}
        ],
        "action": {"ebkp_code": "H01.01", "quantity_type": "area"}
    }

    # Regel mit niedriger Priorität
    low_priority_rule = {
        "name": "Niedrige Priorität: Alle Wände",
        "priority": 15,
        "conditions": [
            {"property": "type", "operator": "equals", "value": "IfcWall"}
        ],
        "action": {"ebkp_code": "H01.02", "quantity_type": "area"}
    }

    # Beide Regeln erstellen
    client.post("/projects/test-project/mapping-rules", json=high_priority_rule)
    client.post("/projects/test-project/mapping-rules", json=low_priority_rule)

    # Test-Element das beide Regeln erfüllen würde
    test_element = {
        "type": "IfcWall",
        "properties": {
            "Pset_WallCommon.IsExternal": "True"
        }
    }

    # Die hohe Prioritäts-Regel sollte zuerst angewendet werden
    # (würde in der echten Anwendung getestet werden)
```

## Risiken und Mitigation

### 1. Regel-Komplexität und Performance
**Risiko:** Zu komplexe Regeln führen zu Performance-Problemen bei grossen Projekten
**Lösung:**
- Limit von max. 5 Bedingungen pro Regel
- Index auf häufig verwendeten Properties
- Caching von Regel-Ergebnissen für wiederkehrende Elemente
- Regel-Test vor Speicherung mit Performance-Messung

### 2. Property-Konsistenz über verschiedene IFC-Dateien
**Risiko:** Verschiedene IFC-Dateien haben unterschiedliche Property-Sets oder Werte
**Lösung:**
- Automatische Erkennung verfügbarer Properties pro Projekt
- Fallback-Mechanismen für fehlende Properties
- Warnungen bei Regel-Test wenn Properties nicht konsistent sind

### 3. Regel-Konflikte und Priorisierung
**Risiko:** Mehrere Regeln treffen auf dasselbe Element zu
**Lösung:**
- Klare Prioritäts-Systematik (niedriger Wert = höhere Priorität)
- Regel-Konflikt-Detektion beim Erstellen/Testen
- Transparente Anzeige welche Regel angewendet wurde

### 4. Datenqualität und Mengendaten-Verfügbarkeit
**Risiko:** Elemente haben nicht die erforderliche Mengeneinheit (Fläche/Volumen/Länge)
**Lösung:**
- Validierung bei Regel-Erstellung welche Elemente die gewählte Mengeneinheit haben
- Automatische Erkennung verfügbarer Mengeneinheiten pro Element-Typ
- Warnungen bei Regel-Test für Elemente ohne passende Mengen

### 5. Regel-Wartbarkeit bei sich ändernden Modellen
**Risiko:** Regeln müssen angepasst werden wenn sich IFC-Modelle ändern
**Lösung:**
- Laufende Statistik über Regel-Treffer
- Automatische Deaktivierung inaktiver Regeln
- Regel-Performance-Monitoring und Optimierungsvorschläge

## Implementierung

### Backend-Architektur

#### Datenmodelle und MongoDB-Schema
- MongoDB Collection `mappingRules`
- Pydantic-Modelle für MappingRule, MappingCondition
- CRUD-API-Endpunkte für Regeln
- Grundlegende Datenbank-Indizes

#### Rule Engine Core
- RuleEvaluator-Klasse mit Bedingungs-Matching
- PropertyAnalyzer für verfügbare Properties
- Integration in bestehende IFC-Verarbeitung
- Unit Tests für Rule Engine

#### API-Funktionen
- `/available-properties` Endpunkt für verfügbare Properties
- `/mapping-rules` CRUD-Endpunkte
- Unit Tests für API-Funktionen

#### Frontend-Implementation
- Regel-Management UI
- Regel-Erstellung mit Dropdowns für Properties und Werte
- Integration in bestehende QTO-Tab-Struktur

#### Integration & Testing
- Integration mit Cost-Plugin
- Basis-Tests für komplette Funktionalität

## Entscheidungspunkte

1. **Maximale Bedingungen:** Max. 3 Bedingungen pro Regel (für Einfachheit)
2. **Operatoren:** Nur "ist gleich" und "ist nicht gleich" für Initial Version
3. **Konflikt-Handling:** Prioritäts-System (höherer Wert = höhere Priorität)
4. **Prioritäts-Bereich:** 1-20 (1 = niedrigste, 20 = höchste Priorität)



