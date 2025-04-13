// Defines the structure for each item in the ebkpData array
export interface EbkpDataItem {
  code: string;
  name: string;
  // Add other fields if necessary, e.g., description, level
}

export const ebkpData: EbkpDataItem[] = [
  // C: Konstruktion
  { code: "C1.1", name: "Bodenplatte" },
  { code: "C1.2", name: "Fundamente" },
  { code: "C2.1", name: "Aussenwände" },
  { code: "C2.2", name: "Innenwände" },
  { code: "C2.3", name: "Stützen" },
  { code: "C2.4", name: "Decken" },
  { code: "C3.1", name: "Dachkonstruktion" },
  { code: "C3.2", name: "Dachaufbauten" },

  // E: Äussere Wandbekleidungen
  { code: "E1.1", name: "Verputzte Aussendämmung" },
  { code: "E1.2", name: "Fensterbänke" },
  { code: "E1.3", name: "Fenster und Türen" },
  { code: "E1.4", name: "Aussenfensterbänke" },

  // I: Elektroanlangen
  { code: "I1.1", name: "Elektroinstallation" },
  { code: "I1.2", name: "Beleuchtung" },
  { code: "I1.3", name: "Blitzschutz" },

  // Add more standard eBKP-H codes for completeness
  { code: "A1.1", name: "Kaufpreis" },
  { code: "A1.2", name: "Nebenkosten" },

  { code: "B1.1", name: "Abbruch Gebäude" },
  { code: "B2.1", name: "Baustellenzufahrt" },
  { code: "B2.2", name: "Baustelleninstallation" },

  { code: "D1.1", name: "Heizungsanlage" },
  { code: "D1.2", name: "Lüftungsanlage" },
  { code: "D1.3", name: "Sanitäranlage" },

  { code: "F1.1", name: "Flachdachabdichtung" },
  { code: "F1.2", name: "Dachentwässerung" },

  { code: "G1.1", name: "Innenwände nicht tragend" },
  { code: "G1.2", name: "Innentüren" },
  { code: "G2.1", name: "Estriche" },
  { code: "G2.2", name: "Bodenbelag" },
  { code: "G3.1", name: "Wandverkleidungen" },
  { code: "G3.2", name: "Wandbeläge" },

  { code: "H1.1", name: "Sanitärapparate" },
  { code: "H1.2", name: "Sanitärleitungen" },

  { code: "J1.1", name: "Steuerung und Regelung" },

  { code: "V1.1", name: "Architektenhonorar" },
  { code: "V1.2", name: "Ingenieurhonorar" },
  { code: "V2.1", name: "Finanzierungskosten" },

  { code: "W1.1", name: "Projektmanagement" },
  { code: "W1.2", name: "Bauleitung" },
];
