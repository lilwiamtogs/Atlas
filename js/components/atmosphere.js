function planet(side = 'right', ringed = false) {
  const cx = side === 'right' ? 1260 : -260;
  return `
    <g class="cosmic-planet cosmic-planet-${side}">
      <circle cx="${cx}" cy="410" r="690"></circle>
      <ellipse cx="${cx}" cy="410" rx="690" ry="205"></ellipse>
      <ellipse cx="${cx}" cy="410" rx="690" ry="430"></ellipse>
      <ellipse cx="${cx}" cy="410" rx="245" ry="690"></ellipse>
      <ellipse cx="${cx}" cy="410" rx="470" ry="690"></ellipse>
      <path d="M${cx - 690} 410h1380"></path>
      ${ringed ? `<ellipse class="planet-ring" cx="${cx}" cy="410" rx="910" ry="245" transform="rotate(-11 ${cx} 410)"></ellipse>
        <ellipse class="planet-ring planet-ring-outer" cx="${cx}" cy="410" rx="980" ry="280" transform="rotate(-11 ${cx} 410)"></ellipse>` : ''}
    </g>`;
}

function galaxy(side = 'left') {
  const placement = side === 'right'
    ? 'translate(1520 -40) scale(-1.35 1.35)'
    : 'translate(-520 -40) scale(1.35)';
  return `
    <g class="cosmic-galaxy cosmic-galaxy-${side}" transform="${placement}">
      <path d="M-310 470C-90 55 570 20 810 300C1040 568 715 875 345 750C55 650 52 310 322 222C540 150 716 326 640 506C580 650 360 650 275 520C202 406 304 286 423 304C520 318 559 414 510 477"></path>
      <path d="M-255 530C15 105 610 98 770 360C914 598 620 820 336 690C120 592 126 350 335 278C492 225 626 355 580 492"></path>
      <path d="M-165 600C90 258 505 225 650 430C765 594 545 742 345 635C205 560 225 408 360 355"></path>
      <circle cx="477" cy="438" r="18"></circle>
      <circle cx="477" cy="438" r="34"></circle>
    </g>`;
}

function orbitField(side = 'left') {
  const cx = side === 'left' ? -110 : 1110;
  return `
    <g class="cosmic-orbits cosmic-orbits-${side}">
      <circle cx="${cx}" cy="410" r="170"></circle>
      <circle cx="${cx}" cy="410" r="310"></circle>
      <circle cx="${cx}" cy="410" r="475"></circle>
      <circle cx="${cx}" cy="410" r="650"></circle>
      <ellipse cx="${cx}" cy="410" rx="790" ry="265" transform="rotate(9 ${cx} 410)"></ellipse>
      <ellipse cx="${cx}" cy="410" rx="900" ry="390" transform="rotate(-8 ${cx} 410)"></ellipse>
      <circle cx="${side === 'left' ? 575 : 425}" cy="285" r="32"></circle>
    </g>`;
}

function eclipse(side = 'right') {
  const cx = side === 'right' ? 1200 : -200;
  const inner = side === 'right' ? 1085 : -85;
  return `
    <g class="cosmic-eclipse cosmic-eclipse-${side}">
      <circle cx="${cx}" cy="410" r="640"></circle>
      <circle cx="${inner}" cy="410" r="540"></circle>
      <ellipse cx="${cx}" cy="410" rx="860" ry="220" transform="rotate(14 ${cx} 410)"></ellipse>
      <path d="M${cx - 720} 565C${cx - 260} 260 ${cx + 235} 180 ${cx + 760} 455"></path>
    </g>`;
}

function plate(content, index) {
  return `<svg class="atmosphere-plate cosmic-plate cosmic-plate-${index}${index === 1 ? ' cosmic-plate-feature' : ''}" viewBox="0 0 1000 820" preserveAspectRatio="xMidYMid meet">${content}</svg>`;
}

function nextAtmosphereSeed() {
  try {
    const stored = sessionStorage.getItem('atlas.atmosphereSeed');
    const previous = stored === null ? -1 : Number(stored);
    const step = 1 + Math.floor(Math.random() * 3);
    const next = (previous + step + 4) % 4;
    sessionStorage.setItem('atlas.atmosphereSeed', String(next));
    return next;
  } catch {
    return Math.floor(Math.random() * 4);
  }
}

const atmosphereSeed = nextAtmosphereSeed();

const baseDesigns = [
  () => [galaxy('right'), planet('right'), orbitField('left')],
  () => [galaxy('left'), eclipse('right'), planet('left', true)],
  () => [galaxy('right'), orbitField('right'), planet('left')],
  () => [galaxy('left'), eclipse('left'), orbitField('left')],
];

export default function Atmosphere(route) {
  const atmosphereRoute = route === 'class' ? 'schedule' : route;
  const routeOffset = { home: 0, schedule: 1, import: 2 }[atmosphereRoute] || 0;
  const plates = baseDesigns[(atmosphereSeed + routeOffset) % baseDesigns.length]();
  const coordinates = atmosphereRoute === 'home'
    ? ['ORBITAL PLATE 01 / ARC 214&deg;', '14.5995&deg; N / 120.9842&deg; E', 'FIELD AP-26 / PASS 07', 'AZ 042.6&deg; / EL +18.2', 'NODE 05 / REV 03', '120&deg;59&prime;03&Prime; E']
    : atmosphereRoute === 'import'
      ? ['SCAN PLATE 03 / ARC 118&deg;', 'DATUM OCR / FIELD 04', 'CAPTURE AXIS / PASS 03', 'FRAME 06 / ROT +02.4&deg;', 'NODE 11 / REV 02', '14&deg;35&prime;58&Prime; N']
      : ['ORBITAL PLATE 02 / ARC 286&deg;', 'DATUM WK-26 / FIELD 06', 'WEEK PLATE / PASS 12', 'AZ 286.2&deg; / EL +09.7', 'NODE 08 / REV 01', 'GRID 14 / SECTOR C'];

  return `
    <div class="atlas-atmosphere atmosphere-${atmosphereRoute}" aria-hidden="true">
      ${plates.map((content, index) => plate(content, index + 1)).join('')}
      ${coordinates.map((coordinate, index) => `<span class="coordinate-label coordinate-label-${index + 1}">${coordinate}</span>`).join('')}
    </div>`;
}
