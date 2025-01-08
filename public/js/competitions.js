document
  .getElementById("login-form")
  .addEventListener("submit", async function (event) {
    event.preventDefault();
    const competitionId = document.getElementById("competition-id").value;
    const response = await fetch(
      `/comp?password=${encodeURIComponent(competitionId)}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (response.ok) {
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("text/html")) {
        // If the response is HTML, redirect to the protected page
        window.location.href =
          "/comp?password=" + encodeURIComponent(competitionId);
      } else {
        const result = await response.json();
        const messageElement = document.getElementById("login-message");
        if (result.valid) {
          messageElement.textContent = "Login successful!";
          messageElement.style.color = "green";
        } else {
          messageElement.textContent =
            "Invalid competition-id. Please try again.";
          messageElement.style.color = "red";
        }
      }
    }
  });
