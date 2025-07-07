// Defines the structure for each item in the ebkpData array
export interface EbkpDataItem {
  code: string;
  name: string;
  // Add other fields if necessary, e.g., description, level
}

export const ebkpData: EbkpDataItem[] = [
  // C: Konstruktion
  { code: "C01.01", name: "Bodenplatte" },
  { code: "C01.02", name: "Fundamente" },
  { code: "C02.01", name: "Aussenwände" },
  { code: "C02.02", name: "Innenwände" },
  { code: "C02.03", name: "Stützen" },
  { code: "C02.04", name: "Decken" },
  { code: "C03.01", name: "Dachkonstruktion" },
  { code: "C03.02", name: "Dachaufbauten" },

  // E: Äussere Wandbekleidungen
  { code: "E01.01", name: "Verputzte Aussendämmung" },
  { code: "E01.02", name: "Fensterbänke" },
  { code: "E01.03", name: "Fenster und Türen" },
  { code: "E01.04", name: "Aussenfensterbänke" },

  // I: Elektroanlangen
  { code: "I01.01", name: "Elektroinstallation" },
  { code: "I01.02", name: "Beleuchtung" },
  { code: "I01.03", name: "Blitzschutz" },

  // Add more standard eBKP-H codes for completeness
  { code: "A01.01", name: "Kaufpreis" },
  { code: "A01.02", name: "Nebenkosten" },

  { code: "B01.01", name: "Abbruch Gebäude" },
  { code: "B02.01", name: "Baustellenzufahrt" },
  { code: "B02.02", name: "Baustelleninstallation" },

  { code: "D01.01", name: "Heizungsanlage" },
  { code: "D01.02", name: "Lüftungsanlage" },
  { code: "D01.03", name: "Sanitäranlage" },

  { code: "F01.01", name: "Flachdachabdichtung" },
  { code: "F01.02", name: "Dachentwässerung" },

  { code: "G01.01", name: "Innenwände nicht tragend" },
  { code: "G01.02", name: "Innentüren" },
  { code: "G02.01", name: "Estriche" },
  { code: "G02.02", name: "Bodenbelag" },
  { code: "G03.01", name: "Wandverkleidungen" },
  { code: "G03.02", name: "Wandbeläge" },

  { code: "H01.01", name: "Sanitärapparate" },
  { code: "H01.02", name: "Sanitärleitungen" },

  { code: "J01.01", name: "Steuerung und Regelung" },

  { code: "V01.01", name: "Architektenhonorar" },
  { code: "V01.02", name: "Ingenieurhonorar" },
  { code: "V02.01", name: "Finanzierungskosten" },

  { code: "W01.01", name: "Projektmanagement" },
  { code: "W01.02", name: "Bauleitung" },
];
