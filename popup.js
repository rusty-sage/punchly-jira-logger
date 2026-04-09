const input = document.getElementById("userName");
const form = document.getElementById("form");
const statusEl = document.getElementById("status");

chrome.storage.local.get(["userName"], (result) => {
  if (result.userName) {
    input.value = result.userName;
  }
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = input.value.trim();
  chrome.storage.local.set({ userName: name }, () => {
    statusEl.textContent = "Saved!";
    setTimeout(() => {
      statusEl.textContent = "";
    }, 2000);
  });
});
