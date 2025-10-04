// Centralized MongoDB Initialization Script
// Creates databases, collections, indexes, and users for QTO, Cost, and LCA plugins.

print("Starting MongoDB initialization...");

// Connect to admin database first to create users/roles
// The initial connection will use the root user credentials (e.g., MONGO_INITDB_ROOT_USERNAME)
// provided via environment variables to the MongoDB container, which the entrypoint script uses.
db = db.getSiblingDB("admin");

// --- Database and Collection Setup ---

// Database names - use environment variables or defaults
const qtoDbName = process.env.MONGODB_QTO_DATABASE || "qto";
const costDbName = process.env.MONGODB_DATABASE || "cost"; // Note: MONGODB_DATABASE often refers to the primary app DB (cost)
const lcaDbName = process.env.MONGODB_LCA_DATABASE || "lca";

const databasesToInit = [
  {
    name: qtoDbName,
    collections: ["projects", "elements", "ifc_processing_jobs"],
    indexes: {
      elements: [{ project_id: 1 }, { element_type: 1 }, { global_id: 1 }],  // Add global_id index
      ifc_processing_jobs: [{ status: 1 }, { created_at: -1 }],
    },
  },
  {
    name: costDbName,
    collections: ["costData", "costSummaries", "costElements"],
    indexes: {
      costData: [{ element_id: 1 }, { global_id: 1 }, { project_id: 1 }, { ebkp_code: 1 }],
      costSummaries: [
        { project_id: 1, unique: true },
        { updated_at: 1 },
        { total_from_elements: 1 },
        { total_from_cost_data: 1 },
      ],
      costElements: [
        { element_id: 1 },
        { global_id: 1 },
        { ebkp_code: 1 },
        { project_id: 1 },
        { qto_element_id: 1 },
      ],
    },
  },
  {
    name: lcaDbName,
    collections: [
      "lcaResults",
      "materialLibrary",
      "materialEmissions",
      "elementEmissions",
    ],
    indexes: {
      lcaResults: [{ element_id: 1 }],
      materialLibrary: [{ name: 1 }],
      materialEmissions: [{ projectId: 1 }],
      elementEmissions: [{ qto_element_id: 1 }, { project_id: 1 }],
    },
  },
];

print("\nInitializing databases, collections, and indexes...");
databasesToInit.forEach((dbInfo) => {
  print(`Switching to database: ${dbInfo.name}`);
  db = db.getSiblingDB(dbInfo.name);

  // Create collections
  dbInfo.collections.forEach((collName) => {
    if (!db.getCollectionNames().includes(collName)) {
      db.createCollection(collName);
      print(`  Created collection: ${collName}`);
    } else {
      print(`  Collection already exists: ${collName}`);
    }
  });

  // Create indexes
  if (dbInfo.indexes) {
    Object.entries(dbInfo.indexes).forEach(([collName, indexList]) => {
      const collection = db.getCollection(collName);
      indexList.forEach((indexSpec) => {
        try {
          let options = {};
          let indexKey = indexSpec;
          if (indexSpec.unique) {
            options.unique = true;
            // Assumes the actual key is the first property if unique option is present
            indexKey = Object.keys(indexSpec).reduce((key, prop) => {
              if (prop !== "unique") key[prop] = indexSpec[prop];
              return key;
            }, {});
          }
          collection.createIndex(indexKey, options);
          print(
            `    Created index on ${collName}: ${JSON.stringify(indexKey)} ${
              options.unique ? "(unique)" : ""
            }`
          );
        } catch (e) {
          // Ignore index already exists errors (code 85)
          if (e.code !== 85) {
            print(
              `    ERROR creating index on ${collName} for key ${JSON.stringify(
                indexKey
              )}: ${e.message}`
            );
          } else {
            print(
              `    Index already exists on ${collName}: ${JSON.stringify(
                indexKey
              )}`
            );
          }
        }
      });
    });
  }
});

// --- Service User Creation ---

// Switch back to admin DB to create users (though we should already be connected to it)
db = db.getSiblingDB("admin");
print("\nCreating service-specific users...");

// Get credentials strictly from env vars. Script will fail if they are not set.
const qtoUser = process.env.MONGODB_QTO_USER || "qto_service"; // Keep default username for fallback
const qtoPassword = process.env.MONGODB_QTO_PASSWORD; // No fallback generation
const costUser = process.env.MONGODB_COST_USER || "cost_service"; // Keep default username for fallback
const costPassword = process.env.MONGODB_COST_PASSWORD; // No fallback generation
const lcaUser = process.env.MONGODB_LCA_USER || "lca_service"; // Keep default username for fallback
const lcaPassword = process.env.MONGODB_LCA_PASSWORD; // No fallback generation

// Check if passwords are provided - if not, the createUser command will fail, which is intended.
if (!qtoPassword || !costPassword || !lcaPassword) {
  print(
    "\n*** ERROR: One or more service user passwords (MONGODB_QTO_PASSWORD, MONGODB_COST_PASSWORD, MONGODB_LCA_PASSWORD) are not set in the environment. User creation will likely fail. ***\n"
  );
}

// QTO service user
db.createUser({
  user: qtoUser,
  pwd: qtoPassword,
  roles: [{ role: "readWrite", db: qtoDbName }],
});
print(`  Created/Updated user: ${qtoUser}`);

// Cost service user
db.createUser({
  user: costUser,
  pwd: costPassword,
  roles: [
    { role: "readWrite", db: costDbName },
    { role: "read", db: qtoDbName }, // Cost service needs to read QTO elements
  ],
});
print(`  Created/Updated user: ${costUser}`);

// LCA service user
db.createUser({
  user: lcaUser,
  pwd: lcaPassword,
  roles: [
    { role: "readWrite", db: lcaDbName },
    { role: "read", db: costDbName }, // LCA might read cost data
    { role: "read", db: qtoDbName }, // LCA needs to read QTO elements/materials
  ],
});
print(`  Created/Updated user: ${lcaUser}`);

print("\nMongoDB initialization completed successfully.");
