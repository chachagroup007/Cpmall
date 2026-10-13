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


const otpForm = document.getElementById("email-otp-form");
const emailInput = document.getElementById("registration-email");
const otpInput = document.getElementById("registration-otp");
const sendOtpButton = document.getElementById("send-otp-button");
const verifyOtpButton = document.getElementById("verify-otp-button");
const registrationMessage = document.getElementById("registration-message");
const registrationNextStep = document.getElementById("registration-next-step");
const authenticatorStage = document.getElementById("authenticator-stage");
const authenticatorQr = document.getElementById("authenticator-qr");
const authenticatorKey = document.getElementById("authenticator-manual-key");
const authenticatorCode = document.getElementById("authenticator-code");
const authenticatorMessage = document.getElementById("authenticator-message");
const verifyAuthenticatorButton = document.getElementById("verify-authenticator-button");
const copyAuthenticatorKey = document.getElementById("copy-authenticator-key");
const personalInformationStage = document.getElementById("personal-information-stage");
const personalInformationMessage = document.getElementById("personal-information-message");
const savePersonalInformationButton = document.getElementById("save-personal-information-button");
const customerNumberResult = document.getElementById("customer-number-result");
const identityVerificationStage = document.getElementById("identity-verification-stage");
const identityVerificationMessage = document.getElementById("identity-verification-message");
const submitIdentityVerificationButton = document.getElementById("submit-identity-verification-button");
let registrationUserId = "";

async function submitRegistrationRequest(url, payload, button, idleLabel) {
  button.disabled = true;
  button.textContent = "Please wait…";
  if (registrationMessage) registrationMessage.textContent = "";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      const wait = data.retryAfterSeconds ? ` Wait ${data.retryAfterSeconds} seconds before retrying.` : "";
      throw new Error((data.message || "The request could not be completed.") + wait);
    }
    if (registrationMessage) registrationMessage.textContent = data.message || "Done.";
    if (data.userId && registrationNextStep) {
      registrationNextStep.hidden = false;
      registrationUserId = data.userId;
      registrationNextStep.textContent = "Email verified. Set up Google Authenticator below to continue.";
      if (authenticatorStage) authenticatorStage.hidden = false;
      startAuthenticatorSetup();
      if (otpInput) otpInput.disabled = true;
      if (sendOtpButton) sendOtpButton.disabled = true;
      if (verifyOtpButton) verifyOtpButton.disabled = true;
    }
    return data;
  } catch (error) {
    if (registrationMessage) registrationMessage.textContent = error.message || "A network error occurred.";
    return null;
  } finally {
    if (!registrationNextStep || registrationNextStep.hidden) {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  }
}

if (sendOtpButton && emailInput) {
  sendOtpButton.addEventListener("click", async () => {
    if (!emailInput.reportValidity()) return;
    await submitRegistrationRequest(
      "/api/auth/registration/send-otp",
      { email: emailInput.value },
      sendOtpButton,
      "Send verification code"
    );
  });
}

if (otpForm && emailInput && otpInput && verifyOtpButton) {
  otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!emailInput.reportValidity() || !otpInput.reportValidity()) return;
    await submitRegistrationRequest(
      "/api/auth/registration/verify-otp",
      { email: emailInput.value, otp: otpInput.value },
      verifyOtpButton,
      "Verify email"
    );
  });
}

async function startAuthenticatorSetup() {
  if (!registrationUserId || !authenticatorMessage) return;
  authenticatorMessage.textContent = "Preparing secure setup…";
  try {
    const response = await fetch("/api/auth/registration/authenticator/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ userId: registrationUserId })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || "Authenticator setup failed.");
    authenticatorQr.src = data.qrDataUrl;
    authenticatorQr.hidden = false;
    authenticatorKey.value = data.manualKey;
    authenticatorMessage.textContent = data.message;
  } catch (error) {
    authenticatorMessage.textContent = error.message || "Could not load authenticator setup.";
  }
}

if (copyAuthenticatorKey && authenticatorKey) {
  copyAuthenticatorKey.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(authenticatorKey.value);
      if (authenticatorMessage) authenticatorMessage.textContent = "Setup key copied.";
    } catch {
      authenticatorKey.select();
      if (authenticatorMessage) authenticatorMessage.textContent = "Select and copy the setup key manually.";
    }
  });
}

if (verifyAuthenticatorButton && authenticatorCode) {
  verifyAuthenticatorButton.addEventListener("click", async () => {
    if (!registrationUserId || !authenticatorCode.reportValidity()) return;
    verifyAuthenticatorButton.disabled = true;
    authenticatorMessage.textContent = "Verifying code…";
    try {
      const response = await fetch("/api/auth/registration/authenticator/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ userId: registrationUserId, code: authenticatorCode.value })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "Authenticator verification failed.");
      authenticatorMessage.textContent = data.message;
      authenticatorCode.disabled = true;
      verifyAuthenticatorButton.disabled = true;
      if (personalInformationStage) personalInformationStage.hidden = false;
      if (personalInformationMessage) personalInformationMessage.textContent = "Complete the fields below and save to continue.";
    } catch (error) {
      authenticatorMessage.textContent = error.message || "A network error occurred.";
      verifyAuthenticatorButton.disabled = false;
    }
  });
}


if (savePersonalInformationButton && personalInformationStage) {
  savePersonalInformationButton.addEventListener("click", async () => {
    const fieldIds = [
      "personal-first-name", "personal-father-name", "personal-date-of-birth",
      "personal-phone-code", "personal-phone-number", "personal-address-line-1",
      "personal-city", "personal-country-code"
    ];
    const fields = fieldIds.map((id) => document.getElementById(id)).filter(Boolean);
    const countryField = document.getElementById("personal-country-code");
    if (!registrationUserId) {
      personalInformationMessage.textContent = "Registration session is missing. Start registration again.";
      return;
    }
    if (!fields.every((field) => field.reportValidity())) return;
    if (countryField && !/^[A-Za-z]{2}$/.test(countryField.value.trim())) {
      countryField.setCustomValidity("Enter the two-letter ISO country code, for example CN or NL.");
      countryField.reportValidity();
      countryField.setCustomValidity("");
      return;
    }

    const read = (id) => {
      const field = document.getElementById(id);
      return field ? field.value.trim() : "";
    };
    const payload = {
      userId: registrationUserId,
      firstName: read("personal-first-name"),
      lastName: read("personal-last-name"),
      fatherOrHusbandName: read("personal-father-name"),
      dateOfBirth: read("personal-date-of-birth"),
      phoneCountryCode: read("personal-phone-code"),
      phoneNumber: read("personal-phone-number"),
      addressLine1: read("personal-address-line-1"),
      addressLine2: read("personal-address-line-2"),
      province: read("personal-province"),
      city: read("personal-city"),
      postalCode: read("personal-postal-code"),
      countryCode: read("personal-country-code").toUpperCase()
    };

    savePersonalInformationButton.disabled = true;
    personalInformationMessage.textContent = "Saving personal information…";
    try {
      const response = await fetch("/api/registration/personal-information", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "Could not save personal information.");
      personalInformationMessage.textContent = data.message || "Personal information saved.";
      if (customerNumberResult && data.customerNumber) {
        customerNumberResult.hidden = false;
        customerNumberResult.textContent = "Your customer number: " + data.customerNumber + " — keep it safe.";
      }
      savePersonalInformationButton.textContent = "Saved";
      personalInformationStage.querySelectorAll("input").forEach((input) => { input.disabled = true; });
      if (identityVerificationStage) identityVerificationStage.hidden = false;
      if (identityVerificationMessage) identityVerificationMessage.textContent = "Personal details saved. Complete identity verification below.";
    } catch (error) {
      personalInformationMessage.textContent = error.message || "A network error occurred.";
      savePersonalInformationButton.disabled = false;
    }
  });
}

if (submitIdentityVerificationButton && identityVerificationStage) {
  submitIdentityVerificationButton.addEventListener("click", async () => {
    if (!registrationUserId) {
      identityVerificationMessage.textContent = "Registration session is missing. Start registration again.";
      return;
    }
    const documentType = document.getElementById("identity-document-type");
    const documentNumber = document.getElementById("identity-document-number");
    const issuingCountry = document.getElementById("identity-issuing-country");
    const issueDate = document.getElementById("identity-issue-date");
    const expiryDate = document.getElementById("identity-expiry-date");
    const frontDocument = document.getElementById("identity-front-document");
    const backDocument = document.getElementById("identity-back-document");
    const requiredFields = [documentType, documentNumber, issuingCountry, issueDate, expiryDate, frontDocument];
    if (!requiredFields.every((field) => field && field.reportValidity())) return;
    if (!/^[A-Za-z]{2}$/.test(issuingCountry.value.trim())) {
      issuingCountry.setCustomValidity("Enter a two-letter ISO country code, such as CN or NL.");
      issuingCountry.reportValidity();
      issuingCountry.setCustomValidity("");
      return;
    }
    if (documentType.value !== "passport" && (!backDocument.files || !backDocument.files.length)) {
      backDocument.setCustomValidity("Upload the back image for this document type.");
      backDocument.reportValidity();
      backDocument.setCustomValidity("");
      return;
    }
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    for (const field of [frontDocument, backDocument]) {
      if (field.files && field.files[0]) {
        const file = field.files[0];
        if (!allowedMimeTypes.has(file.type) || file.size > 5 * 1024 * 1024) {
          identityVerificationMessage.textContent = "Choose JPG, PNG, or WEBP images no larger than 5 MB each.";
          return;
        }
      }
    }
    const payload = new FormData();
    payload.append("userId", registrationUserId);
    payload.append("documentType", documentType.value);
    payload.append("documentNumber", documentNumber.value.trim());
    payload.append("issuingCountry", issuingCountry.value.trim().toUpperCase());
    payload.append("issueDate", issueDate.value);
    payload.append("expiryDate", expiryDate.value);
    payload.append("frontDocument", frontDocument.files[0]);
    if (backDocument.files && backDocument.files[0]) payload.append("backDocument", backDocument.files[0]);
    submitIdentityVerificationButton.disabled = true;
    submitIdentityVerificationButton.textContent = "Uploading securely…";
    identityVerificationMessage.textContent = "Submitting identity documents for review…";
    try {
      const response = await fetch("/api/registration/identity-verification", {
        method: "POST", headers: { Accept: "application/json" }, body: payload
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "Could not submit identity documents.");
      identityVerificationMessage.textContent = data.message || "Identity documents submitted.";
      submitIdentityVerificationButton.textContent = "Submitted for review";
      identityVerificationStage.querySelectorAll("input, select").forEach((field) => { field.disabled = true; });
    } catch (error) {
      identityVerificationMessage.textContent = error.message || "A network error occurred.";
      submitIdentityVerificationButton.disabled = false;
      submitIdentityVerificationButton.textContent = "Submit identity documents";
    }
  });
}
