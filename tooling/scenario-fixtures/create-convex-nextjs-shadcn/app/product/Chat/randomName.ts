const namesList =
  'Robert,Linda,Daniel,Anthony,Donald,Paul,Kevin,Brian,Patricia,Jennifer,' +
  'Elizabeth,William,Richard,Jessica,Lisa,Nancy,Matthew,Ashley,Kimberly,' +
  'Donna,Kenneth,Melissa';
const names = namesList.split(',');

export function randomName(): string {
  const picked = names[Math.floor(Math.random() * names.length)];
  return Math.random() > 0.5 ? picked.slice(0, 3) : picked;
}
