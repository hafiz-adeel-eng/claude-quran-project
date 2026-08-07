/* Quranly Hub — homepage interactions (vanilla JS, no dependencies) */
(function () {
  "use strict";

  /* Mobile navigation drawer */
  var menuToggle = document.querySelector("[data-menu-toggle]");
  var mobileNav = document.querySelector("[data-mobile-nav]");
  var mobileNavClose = document.querySelector("[data-mobile-nav-close]");
  var mobileNavBackdrop = document.querySelector("[data-mobile-nav-backdrop]");

  function openMobileNav() {
    if (!mobileNav) return;
    mobileNav.setAttribute("data-open", "true");
    menuToggle && menuToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    var firstLink = mobileNav.querySelector("a, button");
    if (firstLink) firstLink.focus();
  }

  function closeMobileNav() {
    if (!mobileNav) return;
    mobileNav.setAttribute("data-open", "false");
    menuToggle && menuToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  if (menuToggle) {
    menuToggle.addEventListener("click", openMobileNav);
  }
  if (mobileNavClose) {
    mobileNavClose.addEventListener("click", closeMobileNav);
  }
  if (mobileNavBackdrop) {
    mobileNavBackdrop.addEventListener("click", closeMobileNav);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMobileNav();
  });

  /* FAQ accordion */
  var faqButtons = document.querySelectorAll(".faq-question");
  faqButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var expanded = btn.getAttribute("aria-expanded") === "true";
      var answer = document.getElementById(btn.getAttribute("aria-controls"));

      faqButtons.forEach(function (other) {
        if (other !== btn) {
          other.setAttribute("aria-expanded", "false");
          var otherAnswer = document.getElementById(other.getAttribute("aria-controls"));
          if (otherAnswer) otherAnswer.style.maxHeight = null;
        }
      });

      btn.setAttribute("aria-expanded", String(!expanded));
      if (answer) {
        answer.style.maxHeight = expanded ? null : answer.scrollHeight + "px";
      }
    });
  });

  /* Newsletter form (front-end only — needs real endpoint before launch) */
  var newsletterForm = document.querySelector("[data-newsletter-form]");
  if (newsletterForm) {
    newsletterForm.addEventListener("submit", function (e) {
      e.preventDefault();
      newsletterForm.reset();
      var status = newsletterForm.querySelector("[data-newsletter-status]");
      if (status) {
        status.textContent = "Thanks — form wiring pending backend integration.";
      }
    });
  }
})();
