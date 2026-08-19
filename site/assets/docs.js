/** Zvýrazní v obsahu tu sekci, která je právě na obrazovce. */
const links = [...document.querySelectorAll('.toc a')];
const targets = links
  .map((link) => document.querySelector(link.getAttribute('href') ?? ''))
  .filter((element) => element !== null);

if (targets.length) {
  const visible = new Set();

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }

      // Aktivní je první viditelná sekce v pořadí dokumentu.
      const active = targets.find((target) => visible.has(target.id));
      for (const link of links) {
        link.classList.toggle('active', link.getAttribute('href') === '#' + (active?.id ?? ''));
      }
    },
    { rootMargin: '-80px 0px -70% 0px' },
  );

  for (const target of targets) observer.observe(target);
}
