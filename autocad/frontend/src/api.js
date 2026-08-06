export const api = {
  async getStatus() {
    const res = await fetch("/api/status");
    if (!res.ok) throw new Error("Не удалось получить статус AutoCAD");
    return res.json();
  },

  async getSkills(category = "all", query = "") {
    const params = new URLSearchParams({ category, query });
    const res = await fetch(`/api/skills?${params}`);
    if (!res.ok) throw new Error("Ошибка загрузки списка скиллов");
    return res.json();
  },

  async getSkill(skillId) {
    const res = await fetch(`/api/skills/${skillId}`);
    if (!res.ok) throw new Error("Ошибка получения скилла");
    return res.json();
  },

  async executeSkill(skillId) {
    const res = await fetch("/api/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill_id: skillId }),
    });
    if (!res.ok) throw new Error("Ошибка выполнения скилла");
    return res.json();
  },

  async createSkill(skillData) {
    const res = await fetch("/api/skills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skillData),
    });
    if (!res.ok) throw new Error("Ошибка создания скилла");
    return res.json();
  },

  async updateSkill(skillId, skillData) {
    const res = await fetch(`/api/skills/${skillId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skillData),
    });
    if (!res.ok) throw new Error("Ошибка обновления скилла");
    return res.json();
  },

  async deleteSkill(skillId) {
    const res = await fetch(`/api/skills/${skillId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Ошибка удаления скилла");
    }
    return res.json();
  },

  async getLogs() {
    const res = await fetch("/api/logs");
    if (!res.ok) throw new Error("Ошибка получения истории логов");
    return res.json();
  },

  async getHistory(skillId) {
    const res = await fetch(`/api/skills/${skillId}/history`);
    if (!res.ok) throw new Error("Ошибка загрузки истории");
    return res.json();
  },

  async rollbackSkill(skillId, version) {
    const res = await fetch(`/api/skills/${skillId}/rollback?version=${encodeURIComponent(version)}`, {
      method: "POST"
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || "Ошибка отката версии");
    }
    return res.json();
  }
};
