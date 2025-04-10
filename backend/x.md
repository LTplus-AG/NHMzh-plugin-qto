

Read file: plugin-qto/qto_ifc-msg/package.json

Read file: plugin-qto/qto_ifc-msg/src/index.ts

Read file: plugin-qto/qto_ifc-msg/src/send.ts

You are absolutely right! Thanks for pointing that out.

My apologies, I missed that `qto_ifc-msg/src/send.ts` already handles fetching the file from MinIO and POSTing it as `FormData` to the `/upload-ifc` endpoint in the backend. That significantly simplifies the backend changes required.

Let's adjust the plan based on this crucial information:

**Revised Plan (incorporating `qto_ifc-msg`'s current behavior):**

1.  **QTO Backend (`main.py`) Modifications:**
    *   **Keep & Modify `/upload-ifc/`:** This endpoint remains the entry point. Its logic will change:
        *   Receive `FormData` (file, project, filename, timestamp).
        *   Save the uploaded `file` to a temporary location (as it does now).
        *   Open the temp file with `ifcopenshell.open()`.
        *   **Refactor & Call Parsing:** Extract the core parsing logic (from the current `/ifc-elements/{model_id}`) into a reusable function (e.g., `_parse_ifc_data(ifc_file_obj)`). Call this function here.
        *   **Save Parsed Data:** Save the returned parsed element list to MongoDB (e.g., in a `parsed_ifc_data` collection), keyed by `project_name` and/or `filename`. Handle updates/overwrites.
        *   **Send to Kafka:** Format the parsed data (reuse logic from `/send-qto/`) and send it to the `KAFKA_QTO_TOPIC` using `QTOKafkaProducer`.
        *   Clean up the temporary IFC file.
        *   Return a simple success response (the old response format with `model_id`, `element_count`, etc., is no longer needed).
    *   **Remove In-Memory Storage:** Remove the `ifc_models` global dictionary and all related logic.
    *   **Remove Old Endpoints:** Delete `/ifc-elements/{model_id}`, `/qto-elements/{model_id}`, `/models`, and `/delete-model/{model_id}` as they are based on the old in-memory approach.
    *   **New Frontend Data Endpoints:**
        *   `GET /projects/`: Queries MongoDB (`parsed_ifc_data` or a dedicated `projects` collection) to return a list of available project names.
        *   `GET /projects/{project_name}/elements/`: Queries MongoDB for the specified project and returns the stored list of parsed element data.
    *   **Update `MongoDBHelper`:** Add functions to save the parsed element list and retrieve it by project name, and to list distinct project names.
    *   **Update `/health`:** Remove the `models_in_memory` check.
    *   **Dependencies:** No *new* dependencies needed for the backend based on this revised plan.

2.  **`qto_ifc-msg` Service Modifications:**
    *   **No Changes Needed.** It already performs the correct action of fetching from MinIO and POSTing the file to `/upload-ifc`.

3.  **Frontend (`plugin-qto/src/`) Modifications:**
    *   **Remove Upload UI:** In `FileUpload.tsx`, remove the dropzone, upload logic, and related state.
    *   **Implement Project Selection:**
        *   Add UI to display a list of projects.
        *   Fetch the list by calling the new `GET /projects/` backend endpoint.
    *   **Fetch Data on Selection:**
        *   When a project is selected, call the new `GET /projects/{project_name}/elements/` endpoint.
        *   Update the application state with the received element data.
    *   **API Client (`ApiClient.ts`):** Remove `uploadIFC`. Add functions for `GET /projects/` and `GET /projects/{project_name}/elements/`.

This revised plan is much more efficient, leveraging the work already done by `qto_ifc-msg`.

Let's start implementing this revised plan.

**Milestone 1 (Revised): Backend Refactoring**

1.  Extract parsing logic into a reusable function.
2.  Modify `/upload-ifc` to use the new parsing function, save to DB, send to Kafka, and remove in-memory handling.
3.  Add MongoDB helper functions.

I will start by editing `plugin-qto/backend/main.py`. I'll extract the parsing logic first.

**Certainty & Safety:**

.*   **Database Schema:** Carefully design the MongoDB schema for `parsed_ifc_data` to efficiently store and retrieve potentially large lists of elements. Consider indexing `project_name`.
**Error Handling:** Implement robust error handling and logging at each step (MinIO download, parsing, DB save, Kafka send) in the new backend endpoint.

This plan addresses the requirements by decoupling file upload from the QTO frontend, leveraging the existing event-driven pipeline, storing parsed data persistently, and providing a mechanism for the frontend to retrieve this data on demand.
