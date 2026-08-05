/* ==========================================================================
   QuranlyHub — script.js

   Principles
   ----------
   • Progressive enhancement: every section works with JavaScript disabled.
     The FAQ uses native <details>, the nav is a real <nav>, the forms are
     real <form> elements. This file only adds polish and conveniences.
   • No dependencies, no polyfills, no framework. Roughly 6 KB unminified.
   • All listeners are passive where possible and scroll work is batched into
     requestAnimationFrame so nothing blocks the main thread (protects INP).
   • Everything is namespaced inside one IIFE — safe to drop into WordPress
     alongside jQuery or any theme script.

   Contents
   --------
   1.  Helpers
   2.  Sticky header state
   3.  Mobile navigation drawer
   4.  Navigation dropdowns
   5.  FAQ — one panel open at a time
   6.  Scroll reveal animations
   7.  Animated statistics counters
   8.  Lead form validation & submission
   9.  Back-to-top button
   10. Footer year
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     1 · HELPERS
     ==================================================================== */
  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Batch scroll-driven reads/writes into a single animation frame. */
  function onScrollFrame(handler) {
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) { return; }
      ticking = true;
      window.requestAnimationFrame(function () {
        handler();
        ticking = false;
      });
    }, { passive: true });
    handler();
  }

  /**
   * Run `callback(element)` once, the first time each element enters the
   * viewport.
   *
   * A scroll sweep rather than IntersectionObserver. Sections use
   * `content-visibility: auto`, so a subtree that the browser is currently
   * skipping reports zero-area rects for its descendants; measuring live
   * geometry each frame (with the ancestor fallback in `topOf`) keeps the
   * result correct no matter what is being skipped, and needs no threshold
   * tuning. The pending list only shrinks, so per-frame cost trends to zero
   * and reaches zero once everything has been revealed.
   *
   * @param {Element[]} elements
   * @param {function(Element): void} callback
   * @param {number} [margin] Fraction of the viewport to trigger early.
   */
  function whenInView(elements, callback, margin) {
    var pending = elements.slice();
    var ratio = typeof margin === 'number' ? margin : 0.06;

    /**
     * Position of `el`, or of its nearest laid-out ancestor when `el` sits
     * inside a subtree that `content-visibility: auto` is currently
     * skipping (those descendants report an empty rect). The section itself
     * always has geometry, thanks to `contain-intrinsic-size`.
     */
    function topOf(el) {
      var rect = el.getBoundingClientRect();
      if (rect.width > 0 || rect.height > 0) { return rect.top; }

      var host = el.closest ? el.closest('section, .cta-band, footer, main') : null;
      return host ? host.getBoundingClientRect().top : Infinity;
    }

    function sweep() {
      if (!pending.length) { return; }
      var limit = window.innerHeight * (1 - ratio);
      var still = [];

      pending.forEach(function (el) {
        if (topOf(el) < limit) { callback(el); } else { still.push(el); }
      });

      pending = still;
    }

    onScrollFrame(sweep);
    window.addEventListener('resize', sweep, { passive: true });
    /* Late layout shifts (web fonts, revealed sections) can bring elements
       into view without a scroll event. */
    window.addEventListener('load', sweep);
  }


  /* ========================================================================
     2 · STICKY HEADER — adds a shadow once the page has scrolled
     ==================================================================== */
  (function stickyHeader() {
    var header = $('#siteHeader');
    if (!header) { return; }

    onScrollFrame(function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    });
  }());


  /* ========================================================================
     3 · MOBILE NAVIGATION DRAWER
     Handles: open/close, backdrop, body scroll lock, Escape, focus return,
     and a simple focus trap while open.
     ==================================================================== */
  (function mobileNav() {
    var burger = $('#navBurger');
    var menu   = $('#navMenu');
    if (!burger || !menu) { return; }

    /* The backdrop is created here rather than in the HTML so that it never
       exists for users without JavaScript. */
    var backdrop = document.createElement('div');
    backdrop.className = 'nav-backdrop';
    backdrop.setAttribute('hidden', '');
    document.body.appendChild(backdrop);

    var FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea';

    function isOpen() { return menu.classList.contains('is-open'); }

    function open() {
      menu.classList.add('is-open');
      backdrop.removeAttribute('hidden');
      /* Force a reflow so the opacity transition actually runs. */
      void backdrop.offsetWidth;
      backdrop.classList.add('is-visible');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('is-locked');

      var first = $(FOCUSABLE, menu);
      if (first) { first.focus(); }
    }

    function close(returnFocus) {
      menu.classList.remove('is-open');
      backdrop.classList.remove('is-visible');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('is-locked');

      /* Hide the backdrop from the a11y tree once it has faded out. */
      window.setTimeout(function () {
        if (!isOpen()) { backdrop.setAttribute('hidden', ''); }
      }, 260);

      if (returnFocus) { burger.focus(); }
    }

    burger.addEventListener('click', function () {
      isOpen() ? close(false) : open();
    });

    backdrop.addEventListener('click', function () { close(false); });

    /* Any link inside the drawer closes it — including in-page anchors. */
    $$('a', menu).forEach(function (link) {
      link.addEventListener('click', function () {
        if (isOpen()) { close(false); }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (!isOpen()) { return; }

      if (e.key === 'Escape') {
        close(true);
        return;
      }

      /* Keep Tab focus inside the open drawer. */
      if (e.key === 'Tab') {
        var items = $$(FOCUSABLE, menu).filter(function (el) {
          return el.offsetParent !== null;
        });
        if (!items.length) { return; }

        var first = items[0];
        var last  = items[items.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    /* Reset state if the viewport grows past the desktop breakpoint. */
    var desktop = window.matchMedia('(min-width: 67.5em)');
    var onBreakpoint = function (e) { if (e.matches && isOpen()) { close(false); } };

    if (desktop.addEventListener) {
      desktop.addEventListener('change', onBreakpoint);
    } else if (desktop.addListener) {
      desktop.addListener(onBreakpoint); /* Safari < 14 */
    }
  }());


  /* ========================================================================
     4 · NAVIGATION DROPDOWNS
     On mobile these are click-accordions. On desktop CSS handles hover, and
     the click toggle still works for keyboard and touch users.
     ==================================================================== */
  (function dropdowns() {
    var groups = $$('.has-dropdown');
    if (!groups.length) { return; }

    groups.forEach(function (group) {
      var toggle = $('.nav__toggle', group);
      if (!toggle) { return; }

      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        var willOpen = !group.classList.contains('is-open');

        /* Only one dropdown open at a time. */
        groups.forEach(function (other) {
          other.classList.remove('is-open');
          var t = $('.nav__toggle', other);
          if (t) { t.setAttribute('aria-expanded', 'false'); }
        });

        group.classList.toggle('is-open', willOpen);
        toggle.setAttribute('aria-expanded', String(willOpen));
      });
    });

    /* Click outside closes any open dropdown. */
    document.addEventListener('click', function (e) {
      groups.forEach(function (group) {
        if (!group.contains(e.target)) {
          group.classList.remove('is-open');
          var t = $('.nav__toggle', group);
          if (t) { t.setAttribute('aria-expanded', 'false'); }
        }
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') { return; }
      groups.forEach(function (group) {
        if (group.classList.contains('is-open')) {
          group.classList.remove('is-open');
          var t = $('.nav__toggle', group);
          if (t) { t.setAttribute('aria-expanded', 'false'); t.focus(); }
        }
      });
    });
  }());


  /* ========================================================================
     5 · FAQ — keep one panel open at a time
     Native <details> already works without this; it just tidies the UI.
     ==================================================================== */
  (function faqAccordion() {
    var items = $$('#faqList .faq__item');
    if (items.length < 2) { return; }

    items.forEach(function (item) {
      item.addEventListener('toggle', function () {
        if (!item.open) { return; }
        items.forEach(function (other) {
          if (other !== item) { other.open = false; }
        });
      });
    });
  }());


  /* ========================================================================
     6 · SCROLL REVEAL
     The .reveal class is added by JavaScript, so content is always visible
     when scripts are blocked or fail. Skipped entirely for users who prefer
     reduced motion.
     ==================================================================== */
  (function scrollReveal() {
    if (prefersReducedMotion) { return; }

    var selectors = [
      '.card--feature', '.card--course', '.card--teacher', '.card--success',
      '.card--review', '.card--price', '.card--post', '.step', '.stat',
      '.country', '.section__head', '.table-wrap', '.callout',
      '.media-placeholder', '.pricing__notes'
    ].join(',');

    var targets = $$(selectors).filter(function (el) {
      /* Anything already on screen at load stays untouched — no LCP delay. */
      return el.getBoundingClientRect().top > window.innerHeight;
    });
    if (!targets.length) { return; }

    targets.forEach(function (el) { el.classList.add('reveal'); });

    whenInView(targets, function (el) {
      var index = el.parentElement
        ? Array.prototype.indexOf.call(el.parentElement.children, el)
        : 0;

      /* Stagger siblings slightly for a premium cascade, capped at 240ms. */
      el.style.transitionDelay = Math.min(index * 60, 240) + 'ms';
      el.classList.add('is-visible');
    });
  }());


  /* ========================================================================
     7 · ANIMATED STATISTIC COUNTERS
     Counts up once, the first time the stats row is seen.
     ==================================================================== */
  (function counters() {
    var nums = $$('.stat__num[data-count]');
    if (!nums.length) { return; }

    function format(value, suffix) {
      return value.toLocaleString('en-US') + (suffix || '');
    }

    function run(el) {
      var target   = parseInt(el.getAttribute('data-count'), 10);
      var suffix   = el.getAttribute('data-suffix') || '';
      if (isNaN(target)) { return; }

      if (prefersReducedMotion) {
        el.textContent = format(target, suffix);
        return;
      }

      var duration = 1400;
      var start    = null;

      function step(timestamp) {
        if (start === null) { start = timestamp; }
        var progress = Math.min((timestamp - start) / duration, 1);
        /* easeOutCubic */
        var eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = format(Math.floor(eased * target), suffix);
        if (progress < 1) { window.requestAnimationFrame(step); }
      }

      window.requestAnimationFrame(step);
    }

    whenInView(nums, run, 0.15);
  }());


  /* ========================================================================
     8 · LEAD FORMS — validation and submission
     ------------------------------------------------------------------
     WORDPRESS / BACKEND INTEGRATION
     Replace the body of sendLead() with a real request, for example:

       return fetch('/wp-json/quranlyhub/v1/lead', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': window.qhNonce },
         body: JSON.stringify(payload)
       }).then(function (r) { if (!r.ok) { throw new Error('Request failed'); } });

     …or point it at admin-ajax.php, a CRM webhook, or swap the whole form
     for a Contact Form 7 / WPForms shortcode. Field `name` attributes are
     already CRM-friendly: name, email, whatsapp, country, course,
     student_type, teacher_preference, message.
     ==================================================================== */
  (function leadForms() {
    var forms = $$('#trialForm, #trialFormBottom');
    if (!forms.length) { return; }

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    /* Digits, spaces and the usual separators; 7–20 digits after cleaning. */
    var PHONE_RE = /^[0-9]{7,20}$/;

    function setError(field, message) {
      var input = $('input, select, textarea', field);
      if (!input) { return; }

      input.setAttribute('aria-invalid', 'true');

      var error = $('.field__error', field);
      if (!error) {
        error = document.createElement('p');
        error.className = 'field__error';
        error.id = input.id + '-error';
        field.appendChild(error);
      }
      error.textContent = message;
      input.setAttribute('aria-describedby', error.id);
    }

    function clearError(field) {
      var input = $('input, select, textarea', field);
      var error = $('.field__error', field);
      if (input) {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
      if (error) { error.remove(); }
    }

    function validate(form) {
      var firstInvalid = null;

      $$('.field', form).forEach(function (field) {
        var input = $('input, select, textarea', field);
        if (!input || !input.required) { clearError(field); return; }

        var value = (input.value || '').trim();
        var message = '';

        if (!value) {
          message = 'This field is required.';
        } else if (input.type === 'email' && !EMAIL_RE.test(value)) {
          message = 'Please enter a valid email address.';
        } else if (input.type === 'tel' && !PHONE_RE.test(value.replace(/[\s()+.-]/g, ''))) {
          message = 'Please enter a valid phone number, including country code.';
        } else if (input.type === 'text' && value.length < 2) {
          message = 'Please enter at least 2 characters.';
        }

        if (message) {
          setError(field, message);
          if (!firstInvalid) { firstInvalid = input; }
        } else {
          clearError(field);
        }
      });

      return firstInvalid;
    }

    function status(form, message, state) {
      var box = $('.form__status', form);
      if (!box) { return; }
      box.textContent = message;
      box.className = 'form__status' + (state ? ' form__status--' + state : '');
    }

    /* Placeholder transport. Swap for a real endpoint — see the note above. */
    function sendLead(payload) {
      return new Promise(function (resolve) {
        /* eslint-disable-next-line no-console */
        console.info('[QuranlyHub] Lead captured — wire sendLead() to your backend:', payload);
        window.setTimeout(resolve, 700);
      });
    }

    forms.forEach(function (form) {
      /* Clear a field's error as soon as the user starts fixing it. */
      $$('.field input, .field select, .field textarea', form).forEach(function (input) {
        input.addEventListener('input', function () {
          if (input.getAttribute('aria-invalid') === 'true') {
            clearError(input.closest('.field'));
          }
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();

        /* Honeypot — a filled hidden field means a bot. Fail silently. */
        var honeypot = $('input[name="website"]', form);
        if (honeypot && honeypot.value) { return; }

        var firstInvalid = validate(form);
        if (firstInvalid) {
          status(form, 'Please check the highlighted fields and try again.', 'error');
          firstInvalid.focus();
          return;
        }

        var button = $('button[type="submit"]', form);
        var label  = button ? button.innerHTML : '';
        if (button) {
          button.disabled = true;
          button.textContent = 'Sending…';
        }
        status(form, '', null);

        var payload = {};
        new FormData(form).forEach(function (value, key) {
          if (key !== 'website') { payload[key] = value; }
        });
        payload.page = window.location.pathname;
        payload.submitted_at = new Date().toISOString();

        sendLead(payload).then(function () {
          form.reset();
          status(
            form,
            'Jazak Allah khair! Your free trial request has been received — we will confirm your class time on WhatsApp shortly.',
            'ok'
          );

          /* Analytics hook — fires only if a tag manager is present. */
          if (typeof window.dataLayer !== 'undefined') {
            window.dataLayer.push({ event: 'free_trial_lead', form_id: form.id });
          }
        }).catch(function () {
          status(
            form,
            'Sorry, something went wrong. Please message us on WhatsApp at +92 343 9486140 instead.',
            'error'
          );
        }).then(function () {
          if (button) {
            button.disabled = false;
            button.innerHTML = label;
          }
        });
      });
    });
  }());


  /* ========================================================================
     9 · BACK TO TOP
     ==================================================================== */
  (function backToTop() {
    var button = $('#toTop');
    if (!button) { return; }

    onScrollFrame(function () {
      button.hidden = window.scrollY < 700;
    });

    button.addEventListener('click', function () {
      window.scrollTo({
        top: 0,
        behavior: prefersReducedMotion ? 'auto' : 'smooth'
      });
    });
  }());


  /* ========================================================================
     10 · FOOTER YEAR
     ==================================================================== */
  (function footerYear() {
    var year = $('#year');
    if (year) { year.textContent = String(new Date().getFullYear()); }
  }());

}());
