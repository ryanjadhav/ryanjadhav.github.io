document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('loaded');

  const sep = document.querySelector('.prompt-sep');
  const sections = document.querySelectorAll('main section[class]');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const name = entry.target.className.split(' ')[0];
        sep.textContent = name === 'hero' ? ':~' : ':~/' + name;
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => observer.observe(s));
});
