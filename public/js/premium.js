(() => {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('premium-ui');

  const revealTargets = Array.from(document.querySelectorAll([
    '.section-heading',
    '.process-card',
    '.value-cards article',
    '.work-card',
    '.order-section-copy',
    '.order-card',
    '.client-card',
    '.news-card',
    '.faq-list details',
    '.contact-card',
    '.service-page-intro',
    '.service-process article',
    '.service-faq details',
    '.service-price-panel'
  ].join(',')));

  revealTargets.forEach((el, index) => {
    el.classList.add('reveal-ready');
    el.style.setProperty('--reveal-delay', `${Math.min(index % 4, 3) * 55}ms`);
  });

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach((el) => el.classList.add('reveal-in'));
  } else {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('reveal-in');
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealTargets.forEach((el) => observer.observe(el));
  }

  if (window.matchMedia?.('(hover: hover) and (pointer: fine)').matches && !reduceMotion) {
    document.querySelectorAll('.work-card, .client-card, .news-card, .service-price-panel').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        card.style.setProperty('--my', `${event.clientY - rect.top}px`);
      }, { passive: true });
    });
  }
})();
