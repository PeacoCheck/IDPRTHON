import { renderBulkMatchingTable } from "../../components/bulk-import.js";
import { renderBatchImportView } from "../../views/import.js";

// We attach a global listener to intercept hash changes to the import route.
// This is because we cannot modify the global router or app.js in this wave.
window.addEventListener("hashchange", () => {
    if (location.hash.match(/^#\/objects\/\d+\/import$/)) {
        setTimeout(() => {
            const root = document.getElementById("app");
            // Render on top of whatever the router decided to render
            // Since router.js falls back to object view, we overwrite it here.
            root.innerHTML = renderBatchImportView(window.state);
        }, 50); // wait for idiomorph to finish the object view render
    }
});

// Re-render if it loads directly on the import route
if (location.hash.match(/^#\/objects\/\d+\/import$/)) {
    window.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => {
            const root = document.getElementById("app");
            root.innerHTML = renderBatchImportView(window.state);
        }, 500); // Wait for the initial data fetch and render
    });
}

document.addEventListener("input", (event) => {
    if (event.target.matches('#standaloneBatchImportForm input[type="file"]')) {
        const files = [...(event.target.files || [])];
        const label = event.target.closest(".object-file-field")?.querySelector("strong");
        if (label) {
            label.textContent = files.length ? `${files.length} ${files.length === 1 ? "файл выбран" : "файлов выбрано"}` : "Выберите один или несколько файлов";
        }
        
        const list = event.target.form?.querySelector("[data-import-file-list]");
        if (list) {
            const groups = window.state?.workspace?.groups || [];
            const documents = window.state?.documents || [];
            list.innerHTML = renderBulkMatchingTable(files, groups, documents);
        }
    }
});

document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id === "standaloneBatchImportForm") {
        event.preventDefault();
        
        const objectId = window.state?.workspace?.object?.id;
        if (!objectId) return;

        const formData = new FormData(form);
        const rawFiles = formData.getAll("files").filter((file) => file instanceof File && file.name);
        
        if (!rawFiles.length) {
            alert("Выберите хотя бы один файл");
            return;
        }

        const body = new FormData();
        let selectedCount = 0;
        
        for (let index = 0; index < rawFiles.length; index += 1) {
            const file = rawFiles[index];
            const selected = formData.has(`file_selected_${index}`) || rawFiles.length === 1;
            if (!selected) continue;

            body.append("files", file);
            
            const groupId = formData.get(`group_id_${index}`) || formData.get("group_id") || "";
            body.append("group_ids", groupId);
            
            const status = formData.get(`status_${index}`) || "";
            body.append("completion_statuses", status);
            
            const documentId = formData.get(`document_id_${index}`) || "";
            body.append("document_ids", documentId);
            
            selectedCount++;
        }

        if (selectedCount === 0) {
            alert("Не выбрано ни одного файла для загрузки");
            return;
        }

        const btn = form.querySelector('button[type="submit"]');
        if (btn) btn.disabled = true;

        try {
            const response = await fetch(`/api/v1/objects/${objectId}/batch-import`, {
                method: "POST",
                body
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.detail || "Ошибка массовой загрузки");
            }
            
            const data = await response.json();
            // Go back to the object view after success
            window.location.hash = `#/objects/${objectId}`;
            // Let the regular router handle the hash change and refresh the object
        } catch (error) {
            alert(error.message);
        } finally {
            if (btn) btn.disabled = false;
        }
    }
});
