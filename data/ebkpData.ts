interface EBKPItem {
  code: string;
  bezeichnung: string;
}

export const ebkpData: EBKPItem[] = [
  // C: Konstruktion
  { code: "C", bezeichnung: "Konstruktion" },
  { code: "C1", bezeichnung: "Fundation" },
  { code: "C1.1", bezeichnung: "Bodenplatte" },
  { code: "C1.2", bezeichnung: "Fundamente" },
  { code: "C2", bezeichnung: "Tragkonstruktion" },
  { code: "C2.1", bezeichnung: "Aussenwände" },
  { code: "C2.2", bezeichnung: "Innenwände" },
  { code: "C2.3", bezeichnung: "Stützen" },
  { code: "C2.4", bezeichnung: "Decken" },
  { code: "C3", bezeichnung: "Dach" },
  { code: "C3.1", bezeichnung: "Dachkonstruktion" },
  { code: "C3.2", bezeichnung: "Dachaufbauten" },

  // E: Äussere Wandbekleidungen
  { code: "E", bezeichnung: "Äussere Wandbekleidungen, Wandkonstruktionen" },
  { code: "E1", bezeichnung: "Aussenwandbekleidungen" },
  { code: "E1.1", bezeichnung: "Verputzte Aussendämmung" },
  { code: "E1.2", bezeichnung: "Fensterbänke" },
  { code: "E1.3", bezeichnung: "Fenster und Türen" },
  { code: "E1.4", bezeichnung: "Aussenfensterbänke" },

  // I: Elektroanlangen
  { code: "I", bezeichnung: "Elektroanlangen" },
  { code: "I1", bezeichnung: "Elektrische Anlagen" },
  { code: "I1.1", bezeichnung: "Elektroinstallation" },
  { code: "I1.2", bezeichnung: "Beleuchtung" },
  { code: "I1.3", bezeichnung: "Blitzschutz" },

  // Add more standard eBKP-H codes for completeness
  { code: "A", bezeichnung: "Grundstück" },
  { code: "A1", bezeichnung: "Grundstückserwerb" },
  { code: "A1.1", bezeichnung: "Kaufpreis" },
  { code: "A1.2", bezeichnung: "Nebenkosten" },

  { code: "B", bezeichnung: "Vorbereitung" },
  { code: "B1", bezeichnung: "Abbrucharbeiten" },
  { code: "B1.1", bezeichnung: "Abbruch Gebäude" },
  { code: "B2", bezeichnung: "Baustelleneinrichtung" },
  { code: "B2.1", bezeichnung: "Baustellenzufahrt" },
  { code: "B2.2", bezeichnung: "Baustelleninstallation" },

  { code: "D", bezeichnung: "Technik" },
  { code: "D1", bezeichnung: "Haustechnische Anlagen" },
  { code: "D1.1", bezeichnung: "Heizungsanlage" },
  { code: "D1.2", bezeichnung: "Lüftungsanlage" },
  { code: "D1.3", bezeichnung: "Sanitäranlage" },

  { code: "F", bezeichnung: "Bedachung" },
  { code: "F1", bezeichnung: "Dachabdichtung" },
  { code: "F1.1", bezeichnung: "Flachdachabdichtung" },
  { code: "F1.2", bezeichnung: "Dachentwässerung" },

  { code: "G", bezeichnung: "Ausbau" },
  { code: "G1", bezeichnung: "Innenausbau" },
  { code: "G1.1", bezeichnung: "Innenwände nicht tragend" },
  { code: "G1.2", bezeichnung: "Innentüren" },
  { code: "G2", bezeichnung: "Bodenbeläge" },
  { code: "G2.1", bezeichnung: "Estriche" },
  { code: "G2.2", bezeichnung: "Bodenbelag" },
  { code: "G3", bezeichnung: "Wandbeläge" },
  { code: "G3.1", bezeichnung: "Wandverkleidungen" },
  { code: "G3.2", bezeichnung: "Wandbeläge" },

  { code: "H", bezeichnung: "Sanitäranlagen" },
  { code: "H1", bezeichnung: "Sanitäranlagen und -apparate" },
  { code: "H1.1", bezeichnung: "Sanitärapparate" },
  { code: "H1.2", bezeichnung: "Sanitärleitungen" },

  { code: "J", bezeichnung: "Gebäudeautomation" },
  { code: "J1", bezeichnung: "Gebäudeleittechnik" },
  { code: "J1.1", bezeichnung: "Steuerung und Regelung" },

  { code: "V", bezeichnung: "Baunebenkosten" },
  { code: "V1", bezeichnung: "Planungskosten" },
  { code: "V1.1", bezeichnung: "Architektenhonorar" },
  { code: "V1.2", bezeichnung: "Ingenieurhonorar" },
  { code: "V2", bezeichnung: "Bauzinsen" },
  { code: "V2.1", bezeichnung: "Finanzierungskosten" },

  { code: "W", bezeichnung: "Honorare" },
  { code: "W1", bezeichnung: "Generalplanerhonorar" },
  { code: "W1.1", bezeichnung: "Projektmanagement" },
  { code: "W1.2", bezeichnung: "Bauleitung" },
];
