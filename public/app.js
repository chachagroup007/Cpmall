const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

const statusText = document.getElementById("api-status");
const statusButton = document.getElementById("status-button");
const tierGrid = document.getElementById("tier-grid");
const tierNote = document.getElementById("tier-note");

async function checkApiStatus() {
  if (statusText) statusText.textContent = "Checking API…";
  try {
    const response = await fetch("/api/health", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error("API unavailable");
    if (statusText) statusText.textContent = "Application API is online.";
  } catch {
    if (statusText) statusText.textContent = "The API is not responding. Check the server deployment.";
  }
}

async function loadMembershipTiers() {
  try {
    const response = await fetch("/api/membership/tiers", { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok || !data.ok || !Array.isArray(data.tiers) || !data.tiers.length) return;
    if (tierGrid) {
      tierGrid.replaceChildren();
      for (const tier of data.tiers) {
        const card = document.createElement("article");
        card.className = `tier ${String(tier.tier_code || "").toLowerCase()}`;
        const gem = document.createElement("span");
        gem.className = "tier-gem";
        gem.textContent = "◆";
        const heading = document.createElement("h3");
        heading.textContent = tier.tier_name;
        const description = document.createElement("p");
        const orderCount = Number(tier.minimum_completed_orders || 0);
        const spend = Number(tier.minimum_completed_spend || 0);
        description.textContent = orderCount || spend
          ? `${orderCount} completed orders · ${spend.toLocaleString()} minimum spend`
          : "Welcome level";
        card.append(gem, heading, description);
        tierGrid.append(card);
      }
    }
    if (tierNote) tierNote.textContent = "Tier criteria are provided by the marketplace database; final thresholds can be set by an administrator.";
  } catch {
    // The static tier cards remain visible if the API/database is not configured yet.
  }
}

if (statusButton) statusButton.addEventListener("click", checkApiStatus);
checkApiStatus();
loadMembershipTiers();
