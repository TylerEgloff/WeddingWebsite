async function searchGuests(query) {
    const response = await fetch('/api/search-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
    });
    return await response.json();
}

async function getPartyGuests(partyId) {
    const response = await fetch('/api/get-party-guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partyId })
    });
    return await response.json();
}

// Creates a party element, listing all guests of a group
function createPartyElement(party) {
    const partyElement = document.createElement('div');
    partyElement.className = 'party-item mb-3';
    partyElement.setAttribute('data-party-id', party.party_id);

    const partyHeader = document.createElement('div');
    partyHeader.className = 'party-header p-3 border rounded bg-light';
    partyHeader.style.cursor = 'pointer';

    const partyName = document.createElement('div');
    partyName.className = 'mb-1 d-flex justify-content-between align-items-center';
    partyName.innerHTML = `
    <span class="fw-bold" style="font-size: 1.1rem;">${party.party_name}</span>
    <span class="party-badge-arrow">
      ${party.has_responded ? `
        <span class="badge bg-success d-inline-flex align-items-center" style="margin-right:0.5rem;">
          RSVP
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 16 16" style="margin-left:0.3em;">
            <path fill="currentColor" d="M6.173 12.027a.75.75 0 0 1-1.06 0l-3.14-3.14a.75.75 0 1 1 1.06-1.06l2.61 2.61 5.44-5.44a.75.75 0 0 1 1.06 1.06l-6 6z"/>
          </svg>
        </span>
      ` : ''}
      <span class="arrow float-end">&#9660;</span>
    </span>
`;

    partyHeader.appendChild(partyName);

    const guestList = document.createElement('div');
    guestList.className = 'guest-list mt-2 p-3 border rounded';
    guestList.style.display = 'none';

    partyHeader.addEventListener('click', async () => {
        if (guestList.style.display === 'none') {
            if (guestList.children.length === 0) {
                const guests = await getPartyGuests(party.party_id);
                guestList.innerHTML = `
          <div class="mb-2 text-muted small">Please check all guests who will attend:</div>
          ${guests.map(guest => {
                    let displayName;
                    if (!guest.first_name && !guest.last_name) {
                        displayName = guest.is_plus_one ? '(Plus One)' : 'Guest';
                    } else {
                        displayName = `${guest.first_name || ''} ${guest.last_name || ''}`.trim();
                        if (guest.is_plus_one) {
                            displayName += ' (Plus One)';
                        }
                    }

                    return `
              <div class="form-check custom-checkbox mb-2">
                <input class="form-check-input" type="checkbox" 
                  id="guest-${guest.guest_id}" 
                  data-guest-id="${guest.guest_id}"
                  ${guest.is_attending ? 'checked' : ''}>
                <label class="form-check-label" for="guest-${guest.guest_id}">
                  ${displayName}
                </label>
              </div>
            `;
                }).join('')}
        `;
            }
            guestList.style.display = 'block';
            partyHeader.querySelector('.arrow').innerHTML = '&#9650;';
        } else {
            guestList.style.display = 'none';
            partyHeader.querySelector('.arrow').innerHTML = '&#9660;';
        }
    });

    partyElement.appendChild(partyHeader);
    partyElement.appendChild(guestList);

    return partyElement;
}

document.addEventListener('DOMContentLoaded', () => {
    const guestNameInput = document.getElementById('guestName');
    const partyListDiv = document.getElementById('partyList');
    const guestErrorDiv = document.getElementById('guestError');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const rsvpForm = document.getElementById('rsvpForm');

    let searchTimeout;
    let currentParties = [];

    guestNameInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const query = guestNameInput.value.trim();
            guestErrorDiv.style.display = 'none';

            // Clear everything if search box is empty
            if (query === '') {
                currentParties = [];
                partyListDiv.style.display = 'none';
                rsvpForm.innerHTML = '';
                return;
            }

            // Minimum search length
            if (query.length < 2) return;

            loadingIndicator.style.display = 'block';
            partyListDiv.style.display = 'none';
            rsvpForm.innerHTML = '';

            try {
                const newParties = await searchGuests(query);
                loadingIndicator.style.display = 'none';

                if (!newParties || newParties.length === 0) {
                    guestErrorDiv.style.display = 'block';
                    currentParties = [];
                    return;
                }

                currentParties = newParties;
                partyListDiv.style.display = 'block';
                rsvpForm.innerHTML = '<h6 class="mb-3">Select Your Party</h6>';

                newParties.forEach(party => {
                    rsvpForm.appendChild(createPartyElement(party));
                });
            } catch (err) {
                loadingIndicator.style.display = 'none';
                guestErrorDiv.style.display = 'block';
                currentParties = [];
            }
        }, 500);
    });
});

// Submit with all checked guests.
async function submitRSVP() {
    const checkboxes = document.querySelectorAll('#rsvpForm .form-check-input:checked');
    const guestUpdates = Array.from(checkboxes).map(cb => ({
        guest_id: cb.getAttribute('data-guest-id'),
        is_attending: cb.checked
    }));

    if (guestUpdates.length === 0) {
        alert('Please select at least one guest');
        return;
    }

    // Get partyId from the first guest's parent party
    const partyId = document.querySelector('.party-item').getAttribute('data-party-id');

    // If partyID is valid, then submit
    try {
        const result = await fetch('/api/submit-rsvp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guestUpdates, partyId })
        }).then(res => res.json());

        if (result.success) {
            document.getElementById('rsvpSuccess').style.display = 'block';

            const partyHeader = document.querySelector('.party-header');
            if (partyHeader && !partyHeader.querySelector('.badge.bg-success')) {
                const badgeContainer = partyHeader.querySelector('.party-badge-arrow');
                if (badgeContainer) {
                    badgeContainer.insertAdjacentHTML('afterbegin', `
          <span class="badge bg-success d-inline-flex align-items-center" style="margin-right:0.5rem;">
            RSVP
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 16 16" style="margin-left:0.3em;">
              <path fill="currentColor" d="M6.173 12.027a.75.75 0 0 1-1.06 0l-3.14-3.14a.75.75 0 1 1 1.06-1.06l2.61 2.61 5.44-5.44a.75.75 0 0 1 1.06 1.06l-6 6z"/>
            </svg>
          </span>
        `);
                }
            }
        } else {
            alert('RSVP failed: ' + (result.error || 'Unknown error'));
        }
    } catch (err) {
        alert('Error submitting RSVP: ' + err.message);
    }
}