import { Multislider } from '@tjblackman/multislider';

/* -------------------------------------------------------------------------
 * Demo content
 * The slides are built here instead of being written out in index.html so the
 * markup stays short enough to read.
 * ---------------------------------------------------------------------- */

function viewportOf(rootId: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`#${rootId} .MS-content`);
  if (!el) throw new Error(`Demo "${rootId}" is missing its viewport`);
  return el;
}

function numberedSlides(rootId: string, count: number): void {
  const viewport = viewportOf(rootId);
  for (let i = 1; i <= count; i += 1) {
    const slide = document.createElement('div');
    slide.className = 'item';
    slide.innerHTML = `<span>${i}</span>`;
    viewport.append(slide);
  }
}

const LOGOS = [
  'Northwind',
  'Fabrikam',
  'Contoso',
  'Adventure',
  'Litware',
  'Proseware',
  'Tailspin',
  'Woodgrove',
  'Lamna',
  'Relecloud',
];

function logoSlides(): void {
  const viewport = viewportOf('demo-logos');
  LOGOS.forEach((name, i) => {
    const hue = (i * 37) % 360;
    const slide = document.createElement('div');
    slide.className = 'item';
    slide.innerHTML = `
      <span class="logo" style="--logo-hue: ${hue}">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M12 2 22 8v8l-10 6L2 16V8z" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linejoin="round" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
        ${name}
      </span>`;
    viewport.append(slide);
  });
}

const POSTS = [
  {
    title: 'Tractor tips',
    img: '/images/blog1.jpg',
    body: 'Five things worth checking before the first cut of the season, none of which take longer than a coffee.',
  },
  {
    title: 'RV date night',
    img: '/images/blog2.jpg',
    body: 'A folding table, one string of lights, and a parking spot with a view. That is the whole recipe.',
  },
  {
    title: 'The ride',
    img: '/images/blog3.jpg',
    body: 'Two hundred miles of back road, one wrong turn, and the best sandwich of the year.',
  },
  {
    title: 'Family trip',
    img: '/images/blog4.jpg',
    body: 'Packing for four people in a vehicle built for two, and the small compromises that make it work.',
  },
  {
    title: 'Winter driving',
    img: '/images/blog5.jpg',
    body: 'Traction, following distance, and knowing when the smart move is to stay put another night.',
  },
  {
    title: 'Beach safety',
    img: '/images/blog6.jpg',
    body: 'Rip currents are easier to spot than most people think. Here is what to look for from shore.',
  },
];

function cardSlides(): void {
  const viewport = viewportOf('demo-cards');
  for (const post of POSTS) {
    const slide = document.createElement('div');
    slide.className = 'item';
    slide.innerHTML = `
      <article class="card">
        <img src="${post.img}" alt="" loading="lazy" width="480" height="320" />
        <div class="card-body">
          <h4>${post.title}</h4>
          <p>${post.body}</p>
          <a href="#more-examples">Read more</a>
        </div>
      </article>`;
    viewport.append(slide);
  }
}

numberedSlides('demo-step', 12);
numberedSlides('demo-page', 12);
numberedSlides('demo-marquee', 12);
logoSlides();
cardSlides();

/* -------------------------------------------------------------------------
 * Sliders
 * ---------------------------------------------------------------------- */

new Multislider('#demo-step', {
  interval: 2500,
});

new Multislider('#demo-page', {
  advanceBy: 'page',
  interval: 3000,
  duration: 800,
});

new Multislider('#demo-marquee', {
  mode: 'marquee',
  speed: 70,
});

new Multislider('#demo-logos', {
  mode: 'marquee',
  speed: 35,
  draggable: false,
});

new Multislider('#demo-cards', {
  interval: 4000,
  duration: 700,
});

/* -------------------------------------------------------------------------
 * Page chrome: copy button and side nav highlighting
 * ---------------------------------------------------------------------- */

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-copy]')) {
  button.addEventListener('click', async () => {
    const selector = button.dataset['copy'];
    if (!selector) return;
    const source = document.querySelector<HTMLElement>(selector);
    if (!source?.textContent) return;
    try {
      await navigator.clipboard.writeText(source.textContent.trim());
      const original = button.textContent;
      button.textContent = 'Copied';
      window.setTimeout(() => {
        button.textContent = original;
      }, 1400);
    } catch {
      button.textContent = 'Press Ctrl+C';
    }
  });
}

const navLinks = new Map<string, HTMLAnchorElement>();
for (const link of document.querySelectorAll<HTMLAnchorElement>('.sidenav a[href^="#"]')) {
  navLinks.set(link.getAttribute('href')!.slice(1), link);
}

const sections = [...navLinks.keys()]
  .map((id) => document.getElementById(id))
  .filter((el): el is HTMLElement => el !== null);

if (sections.length > 0) {
  const visible = new Set<string>();
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const active = sections.find((section) => visible.has(section.id));
      for (const [id, link] of navLinks) {
        link.classList.toggle('is-active', active?.id === id);
      }
    },
    { rootMargin: '-72px 0px -60% 0px' },
  );
  for (const section of sections) spy.observe(section);
}
