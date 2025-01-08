document.addEventListener("DOMContentLoaded", () => {
  const toolsContainer = document.getElementById("sidebar");

  async function loadTools() {
    try {
      const response = await fetch("/api/tools");
      const tools = await response.json();

      if (Array.isArray(tools)) {
        tools.forEach((tool) => {
          const toolElement = document.createElement("a");
          toolElement.className = "tool-tag";
          toolElement.href = `/tools/${tool.filename.replace(".html", "")}`;
          toolElement.rel = "noopener noreferrer";

          toolElement.innerHTML = `
                        <h3 class="tool-title">${tool.title}</h3>
                    `;

          toolsContainer.appendChild(toolElement);
        });
      } else {
        console.error("Expected an array but received:", tools);
      }
    } catch (error) {
      console.error("Error loading tools:", error);
    }
  }

  // Load tools on page load
  loadTools();
});
