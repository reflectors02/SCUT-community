// Each building has one location: a tier, or the unranked pool.
const buildings = [
  { id: 'sCDI', name: 'Sobrato Campus for Discovery and Innovation', short: 'SCDI', label: 'Sobrato (SCDI)' },
  { id: 'heafey', name: 'Heafey Hall', short: 'HF' },
  { id: 'oconnor', name: "O’Connor Hall", short: 'OC' },
  { id: 'kenna', name: 'Kenna Hall', short: 'KN' },
  { id: 'daly', name: 'Daly Science Center', short: 'DS' },
  { id: 'lucas', name: 'Lucas Hall', short: 'LC' },
  { id: 'vari', name: 'Vari Hall', short: 'VR' },
  { id: 'bergin', name: 'Bergin Hall', short: 'BG' },
  { id: 'alumni', name: 'Alumni Science Hall', short: 'AS' },
  { id: 'charney', name: 'Charney Hall', short: 'CH' }
];

const tiers = ['S', 'A', 'B', 'C', 'D', 'F'];

const hints = [
  'Excellent',
  'Very good',
  'Good',
  'Fair',
  'Poor',
  'Not recommended'
];

const storageKey = 'scut-academic-draft-v1';

let ranking = blankRanking();

// Pre:  The buildings array is defined and every building has a unique id.
// Post: Returns a new object that maps every building id to 'unranked'.
//       The global ranking is not changed.
function blankRanking() {
  return Object.fromEntries(buildings.map(building => [building.id, 'unranked']));
}

// Pre:  message is a string, and the page has an element with id "status".
// Post: The status element's text is message, so screen readers announce it
//       (the element is aria-live="polite").
function announce(message) {
  document.getElementById('status').textContent = message;
}

// Pre:  The page is loaded. localStorage may be missing, blocked or hold bad data.
// Post: If a valid draft is stored under storageKey, ranking holds its tiers
//       (unknown buildings and invalid tiers are ignored and stay 'unranked'),
//       the board is re-rendered and a success message is announced.
//       If there is no draft, ranking is unchanged and a "no saved list" message is announced.
//       If reading or parsing fails, an error message is announced. Nothing is thrown.
function loadSaved() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      announce('No saved list yet. Rank a few buildings, then select Save draft.');
      return;
    }

    const saved = JSON.parse(raw);
    if (!saved || typeof saved.ranking !== 'object' || saved.ranking === null) {
      throw new Error('Invalid draft');
    }

    ranking = blankRanking();
    buildings.forEach(building => {
      if (tiers.includes(saved.ranking[building.id])) {
        ranking[building.id] = saved.ranking[building.id];
      }
    });

    render();
    announce('Your saved list is loaded.');
  } catch (error) {
    announce('Your saved list could not be loaded in this browser. You can still make and download a list.');
  }
}

// Pre:  id is a string and tier is a string.
// Post: If id matches a building and tier is one of tiers or 'unranked',
//       ranking[id] is tier, the board is re-rendered and the move is announced.
//       Otherwise nothing changes.
function moveBuilding(id, tier) {
  if (!buildings.some(building => building.id === id) || ![...tiers, 'unranked'].includes(tier)) {
    return;
  }

  ranking[id] = tier;
  render();

  const building = buildings.find(item => item.id === id);
  announce(building.name + (tier === 'unranked' ? ' returned to the pool.' : ' moved to tier ' + tier + '.'));
}

// Pre:  building is an object from the buildings array, and ranking[building.id] is set.
// Post: Returns a new draggable card element (not yet attached to the page). It contains
//       the building's short mark, a grip icon, its display name and a tier dropdown set
//       to its current tier. Changing the dropdown moves the building and keeps focus on
//       the new dropdown. Dragging the card moves this building to the destination tier.
function makeCard(building) {
  const card = document.createElement('div');
  card.className = 'building';
  card.draggable = false;
  card.title = building.name;

  const top = document.createElement('div');
  top.className = 'building-top';

  const mark = document.createElement('span');
  mark.className = 'building-mark';
  mark.textContent = building.short;

  const grip = document.createElement('span');
  grip.className = 'grip';
  grip.textContent = '⠿';
  grip.setAttribute('aria-hidden', 'true');

  top.append(mark, grip);

  const name = document.createElement('strong');
  name.textContent = building.label || building.name;

  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Tier for ' + building.name);

  ['unranked', ...tiers].forEach(tier => {
    const option = document.createElement('option');
    option.value = tier;
    option.textContent = tier === 'unranked' ? 'Unranked' : 'Tier ' + tier;
    select.append(option);
  });

  select.value = ranking[building.id];

  select.addEventListener('change', () => {
    moveBuilding(building.id, select.value);
    // render() replaced the card, so focus the new dropdown for this building.
    document.querySelector('[aria-label="Tier for ' + building.name + '"]').focus();
  });

  select.addEventListener('pointerdown', event => event.stopPropagation());

  prepareCardDrag(card, building.id);

  card.append(top, name, select);
  return card;
}

// Pre:  x and y are viewport coordinates and the personal board exists.
// Post: Returns the personal tier drop zone or pool under the pointer, or null.
//       Community rows are excluded. Tier labels also accept drops.
function personalDropTarget(x, y) {
  const hit = document.elementFromPoint(x, y);
  const target = hit && hit.closest('#board .tier-row, #pool');
  if (!target) return null;
  return target.id === 'pool' ? target : target.querySelector('.tier-drop');
}

// Pre:  card is a building card and id identifies its building.
// Post: Installs mouse, trackpad and touch dragging. Moving at least six pixels
//       starts a drag; releasing over a personal tier or pool moves the building.
//       Releasing elsewhere or cancelling leaves rankings unchanged. Dropdowns
//       keep their normal behavior. Temporary drag feedback is removed on exit.
function prepareCardDrag(card, id) {
  let drag = null;

  function clearFeedback() {
    if (!drag) return;
    if (drag.ghost) drag.ghost.remove();
    card.classList.remove('is-dragging');
    document.querySelectorAll('.drag-over').forEach(zone => zone.classList.remove('drag-over'));
    drag = null;
  }

  card.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('select')) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, ghost: null };
    card.setPointerCapture(event.pointerId);
  });

  card.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    event.preventDefault();
    if (!drag.ghost) {
      const ghost = document.createElement('div');
      ghost.className = 'drag-preview';
      ghost.textContent = buildings.find(building => building.id === id).name;
      ghost.setAttribute('aria-hidden', 'true');
      document.body.append(ghost);
      drag.ghost = ghost;
      card.classList.add('is-dragging');
    }
    drag.ghost.style.left = (event.clientX + 12) + 'px';
    drag.ghost.style.top = (event.clientY + 12) + 'px';
    document.querySelectorAll('.drag-over').forEach(zone => zone.classList.remove('drag-over'));
    const zone = personalDropTarget(event.clientX, event.clientY);
    if (zone) zone.classList.add('drag-over');
    if (event.clientY < 60) window.scrollBy(0, -16);
    else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 16);
  });

  card.addEventListener('pointerup', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const zone = drag.ghost ? personalDropTarget(event.clientX, event.clientY) : null;
    const tier = zone ? zone.dataset.tier : null;
    clearFeedback();
    if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    if (tier !== null) moveBuilding(id, tier);
  });

  card.addEventListener('pointercancel', clearFeedback);
  card.addEventListener('lostpointercapture', clearFeedback);
}

// Pre:  zone is an element whose data-tier attribute is a tier or 'unranked'.
// Post: zone accepts dropped cards. It shows the 'drag-over' class while a card is over it
//       and removes it when the card leaves or drops. A drop moves that building to
//       zone.dataset.tier.
function prepareDropZone(zone) {
  zone.addEventListener('dragover', event => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', event => {
    if (!zone.contains(event.relatedTarget)) {
      zone.classList.remove('drag-over');
    }
  });

  zone.addEventListener('drop', event => {
    event.preventDefault();
    zone.classList.remove('drag-over');
    moveBuilding(event.dataTransfer.getData('text/plain'), zone.dataset.tier);
  });
}

// Pre:  The page has elements with ids board, pool, search, remaining, progress and empty,
//       and ranking has an entry for every building.
// Post: The board shows one row per tier, holding the cards ranked in that tier.
//       The pool shows the unranked cards that match the search box.
//       The "left" count, the progress text and the empty-pool message are up to date.
//       ranking is not changed.
function render() {
  const board = document.getElementById('board');
  board.replaceChildren();

  tiers.forEach((tier, index) => {
    const row = document.createElement('div');
    row.className = 'tier-row';

    const label = document.createElement('div');
    label.className = 'tier-label';
    label.textContent = tier;
    label.style.background = 'var(--' + tier.toLowerCase() + ')';

    const zone = document.createElement('div');
    zone.className = 'tier-drop';
    zone.dataset.tier = tier;
    zone.dataset.hint = hints[index];
    zone.setAttribute('aria-label', 'Tier ' + tier);

    buildings
      .filter(building => ranking[building.id] === tier)
      .forEach(building => zone.append(makeCard(building)));

    prepareDropZone(zone);
    row.append(label, zone);
    board.append(row);
  });

  const pool = document.getElementById('pool');
  pool.replaceChildren();

  const query = document.getElementById('search').value.trim().toLowerCase();
  const unranked = buildings.filter(building => ranking[building.id] === 'unranked');
  const matching = unranked.filter(building =>
    (building.name + ' ' + building.short).toLowerCase().includes(query)
  );

  matching.forEach(building => pool.append(makeCard(building)));

  document.getElementById('remaining').textContent = unranked.length + ' left';
  document.getElementById('progress').textContent =
    (buildings.length - unranked.length) + ' of ' + buildings.length + ' ranked';

  const empty = document.getElementById('empty');
  empty.hidden = matching.length > 0;
  empty.textContent = unranked.length === 0
    ? 'All buildings ranked! You can still move them between tiers or return them here.'
    : 'No matching buildings in the pool.';
}

// ----- Event wiring -----

// Pre:  The search input exists.
// Post: Typing in the search box filters the pool again.
document.getElementById('search').addEventListener('input', render);

// Pre:  The pool element exists and has data-tier="unranked".
// Post: Cards dropped on the pool go back to 'unranked'.
prepareDropZone(document.getElementById('pool'));

// Pre:  The save button exists.
// Post: Clicking it stores ranking under storageKey and announces success, or announces
//       that storage is unavailable if the write fails.
document.getElementById('save').addEventListener('click', () => {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ranking }));
    document.getElementById('save-note').textContent = 'Saved on this browser. You can keep editing.';
    announce('Your tier list has been saved.');
  } catch (error) {
    announce('Browser storage is unavailable. Use Download list to keep a copy.');
  }
});

// Pre:  The "My saved list" button and the #ranker section exist.
// Post: Clicking it loads the saved draft (see loadSaved) and scrolls to the ranker.
document.getElementById('my-list').addEventListener('click', () => {
  loadSaved();
  document.getElementById('ranker').scrollIntoView();
});

const resetDialog = document.getElementById('reset-dialog');

// Pre:  The reset button and reset dialog exist.
// Post: Clicking Reset list opens the confirmation dialog. ranking is not changed yet.
document.getElementById('reset').addEventListener('click', () => resetDialog.showModal());

// Pre:  The reset dialog is open.
// Post: Clicking Cancel closes the dialog. ranking is not changed.
document.getElementById('cancel-reset').addEventListener('click', () => resetDialog.close());

// Pre:  The reset dialog is open.
// Post: Clicking Reset list sets every building to 'unranked', clears the search box,
//       re-renders, closes the dialog and announces the reset. Saved storage is not changed.
document.getElementById('confirm-reset').addEventListener('click', () => {
  ranking = blankRanking();
  document.getElementById('search').value = '';
  render();
  resetDialog.close();
  announce('All buildings returned to the pool.');
});

// Pre:  The download button exists.
// Post: Clicking it downloads scut-academic-tier-list.txt, with one line per tier and one
//       for Unranked (building names, or '—' if a tier is empty). The temporary URL is
//       released after 1 second. ranking is not changed.
document.getElementById('download').addEventListener('click', () => {
  const lines = [
    'SCUT — My academic building tier list',
    '',
    ...[...tiers, 'unranked'].map(tier =>
      (tier === 'unranked' ? 'Unranked' : tier) + ': ' +
      (buildings
        .filter(building => ranking[building.id] === tier)
        .map(building => building.name)
        .join(', ') || '—')
    )
  ];

  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));

  const link = document.createElement('a');
  link.href = url;
  link.download = 'scut-academic-tier-list.txt';
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Your tier list download is ready.');
});

// ----- Startup -----

// Pre:  The page is loaded and every element above exists.
// Post: The board is drawn with every building unranked. If a saved draft exists, it is
//       loaded. If storage cannot be read, a message is announced and the page still works.
render();
try {
  if (localStorage.getItem(storageKey)) {
    loadSaved();
  }
} catch (error) {
  announce('Browser storage is unavailable. You can still rank and download your list.');
}

// Shared submissions are stored by api.php. Drafts above remain in this browser.
const communityTiers = ['S', 'A', 'B', 'C', 'D', 'F'];
// Pre: summary contains the server totals for each building; community-board exists.
// Post: The community board shows average tiers, scores, counts and unrated buildings.
//       Personal rankings are unchanged.
function renderCommunity(summary) {
  const board = document.getElementById('community-board');
  board.replaceChildren();
  communityTiers.forEach(tier => {
    const row = document.createElement('div'); row.className = 'tier-row';
    const label = document.createElement('div'); label.className = 'tier-label';
    label.textContent = tier; label.style.background = 'var(--' + tier.toLowerCase() + ')';
    const items = document.createElement('div'); items.className = 'tier-drop';
    items.dataset.hint = 'No ratings in this tier yet';
    buildings.filter(building => summary[building.id]?.tier === tier)
      .sort((a, b) => summary[b.id].average - summary[a.id].average)
      .forEach(building => {
        const card = document.createElement('div'); card.className = 'building community-card';
        const name = document.createElement('strong'); name.textContent = building.label || building.name;
        const detail = document.createElement('span'); detail.className = 'community-detail';
        const record = summary[building.id];
        detail.textContent = record.average.toFixed(2) + ' / 5 · ' + record.count + (record.count === 1 ? ' rating' : ' ratings');
        card.append(name, detail); items.append(card);
      });
    row.append(label, items); board.append(row);
  });
  const unrated = buildings.filter(building => !summary[building.id]?.count);
  if (unrated.length) {
    const line = document.createElement('p'); line.className = 'unrated';
    line.textContent = 'Not yet rated: ' + unrated.map(building => building.label || building.name).join(', ');
    board.append(line);
  }
}
// Pre: api.php is available on the same server and the community elements exist.
// Post: Returns a promise for the server response and refreshes the community board.
//       Rejects the promise if the request fails.
async function refreshCommunity() {
  const response = await fetch('api.php', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load community rankings.');
  const data = await response.json();
  renderCommunity(data.community);
  document.getElementById('community-status').textContent = 'Community rankings are up to date.';
  return data;
}
// Pre: The submit button exists and ranking contains the current personal list.
// Post: Clicking submits ranked buildings and replaces this session's previous list.
//       Success refreshes the community board; failure is announced. Drafts are unchanged.
document.getElementById('submit').addEventListener('click', async event => {
  const submitted = Object.fromEntries(Object.entries(ranking).filter(([, tier]) => tier !== 'unranked'));
  if (!Object.keys(submitted).length) { announce('Rank at least one building before submitting.'); return; }
  const button = event.currentTarget; button.disabled = true;
  try {
    const response = await fetch('api.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranking: submitted })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Submission failed.');
    renderCommunity(data.community);
    document.getElementById('community-status').textContent = 'Community rankings are up to date.';
    announce('Your rankings were submitted. Submitting again from this browser replaces your earlier list.');
  } catch (error) { announce(error.message || 'Could not submit rankings.'); }
  finally { button.disabled = false; }
});
// Pre: Personal rankings and the community elements have been initialized.
// Post: Loads community totals and restores the submitted list when no local draft exists.
//       A request failure displays a message.
refreshCommunity().then(data => {
  let hasDraft = false;
  try { hasDraft = !!localStorage.getItem(storageKey); } catch (error) {}
  if (data.mine && !hasDraft) {
    ranking = blankRanking();
    Object.entries(data.mine).forEach(([id, tier]) => { if (id in ranking && tiers.includes(tier)) ranking[id] = tier; });
    render();
  }
}).catch(() => { document.getElementById('community-status').textContent = 'Could not load community rankings. Check that the PHP server is running.'; });
