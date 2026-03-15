/* jshint esversion: 11, asi: true, laxbreak: true, laxcomma: true */
/* global fetch, console, document, window, google, localStorage, alert, paypal */
/* exported initAutocomplete, updatePrice */

console.log("script.js loaded successfully");

// ────────────────────────────────────────────────
// CONFIG & GLOBALS
// ────────────────────────────────────────────────
const SUPABASE_URL = 'https://pvbdoecrqwthalqqfqnh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_MdqPiFAIUfPJGn9_a1hpjA_O03v6gt4';

// MailerSend API token – already set with your provided value
const MAILERSEND_API_TOKEN = 'mlsn.ae98bfc1c451c2ff24fe487f57a6eacd5ec5606cb144d64045948cba55a78121';

let currentTotalPrice = 0;
let paypalRendered = false;
let paypalContainer = null;

// Real road distances from MBJ (fallback)
const roadDistancesFromMBJ = {
  'negril': 80, 'ocho rios': 97, 'kingston': 186, 'blue mountains': 120,
  "dunn's river falls": 97, 'bob marley museum': 186, 'port antonio': 170,
  'treasure beach': 100, 'falmouth': 35, 'runaway bay': 70, 'montego bay': 0,
  'lucca': 40, 'black river': 90, 'mandeville': 110, 'portmore': 170,
  'spanish town': 160, 'may pen': 130, 'savanna-la-mar': 100,
  'buff bay': 140, 'port maria': 120,
};

// ────────────────────────────────────────────────
// Haversine distance
// ────────────────────────────────────────────────
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ────────────────────────────────────────────────
// PRICE CALCULATION & UI UPDATE
// ────────────────────────────────────────────────
function updatePrice() {
  console.log("updatePrice called");

  const estimateEl = document.getElementById('price-estimate');
  const loadingMsg = document.getElementById('paypal-loading');
  paypalContainer = paypalContainer || document.getElementById('paypal-button-container');

  if (!pickupPlace || !dropoffPlace || !pickupPlace.geometry || !dropoffPlace.geometry) {
    estimateEl.textContent = 'Select both locations from suggestions to see estimate';
    loadingMsg.style.display = 'block';
    paypalContainer.style.display = 'none';
    return;
  }

  const lat1 = pickupPlace.geometry.location.lat();
  const lng1 = pickupPlace.geometry.location.lng();
  const lat2 = dropoffPlace.geometry.location.lat();
  const lng2 = dropoffPlace.geometry.location.lng();

  let distanceKm = haversine(lat1, lng1, lat2, lng2);
  const dropoffLower = dropoffPlace.formatted_address.toLowerCase();
  for (const dest in roadDistancesFromMBJ) {
    if (dropoffLower.includes(dest)) {
      distanceKm = roadDistancesFromMBJ[dest];
      break;
    }
  }

  const passengers = parseInt(document.getElementById('passengers').value) || 1;
  let vehicle = document.querySelector('input[name="vehicle"]:checked')?.value || 'sedan';

  const sedanRadio   = document.getElementById('sedan-radio');
  const minibusRadio = document.getElementById('minibus-radio');
  const coachRadio   = document.getElementById('coach-radio');

  if (passengers > 8) {
    vehicle = 'coach';
    coachRadio.checked = true;
    sedanRadio.disabled = minibusRadio.disabled = true;
  } else if (passengers > 4) {
    vehicle = 'minibus';
    minibusRadio.checked = true;
    sedanRadio.disabled = coachRadio.disabled = true;
  } else {
    sedanRadio.disabled = minibusRadio.disabled = coachRadio.disabled = false;
  }

  let baseFixed = 40;
  let basePerKm = 1.10;
  if (vehicle === 'minibus') { baseFixed = 70; basePerKm = 1.80; }
  if (vehicle === 'coach')   { baseFixed = 110; basePerKm = 2.80; }

  const basePrice = baseFixed + basePerKm * distanceKm;
  const extraPaxPrice = Math.max(0, passengers - 4) * 12;
  currentTotalPrice = Math.round(basePrice + extraPaxPrice);

  estimateEl.textContent =
    `Estimated: $${currentTotalPrice} USD (${vehicle}, ${passengers} pax, ~${Math.round(distanceKm)} km)`;

  const isFormComplete = [
    document.getElementById('pickup').value.trim(),
    document.getElementById('dropoff').value.trim(),
    document.getElementById('passengers').value.trim(),
    document.querySelector('input[name="vehicle"]:checked'),
    document.getElementById('datetime').value.trim(),
    document.getElementById('service').value.trim(),
    document.getElementById('name').value.trim(),
    document.getElementById('contact').value.trim(),
    document.getElementById('email').value.trim()
  ].every(Boolean);

  if (isFormComplete && currentTotalPrice > 0) {
    loadingMsg.style.display = 'none';
    paypalContainer.style.display = 'block';

    if (!paypalRendered) {
      renderPayPalButtons();
      paypalRendered = true;
    }
  } else {
    loadingMsg.style.display = 'block';
    paypalContainer.style.display = 'none';
  }
}

// ────────────────────────────────────────────────
// RENDER PAYPAL BUTTONS
// ────────────────────────────────────────────────
function renderPayPalButtons() {
  console.log("Rendering PayPal buttons...");

  paypal.Buttons({
    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          amount: {
            value: currentTotalPrice.toFixed(2),
            currency_code: 'USD'
          },
          description: `Yaadtrip Tours Booking - ${document.querySelector('input[name="vehicle"]:checked')?.value || 'sedan'} - ${document.getElementById('passengers').value || 1} pax`
        }]
      });
    },

    onApprove: async (data, actions) => {
      let trackingCode = 'N/A';

      try {
        const orderData = await actions.order.capture();
        const transactionId = orderData.purchase_units[0].payments.captures[0].id;

        trackingCode = `YTD-${new Date().toISOString().slice(0,10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

        const customerEmail = document.getElementById('email')?.value.trim() || '';

        const formData = {
          tracking_code: trackingCode,
          transaction_id: transactionId,
          amount: currentTotalPrice,
          pickup: document.getElementById('pickup').value,
          dropoff: document.getElementById('dropoff').value,
          datetime: document.getElementById('datetime').value,
          passengers: parseInt(document.getElementById('passengers').value) || 1,
          vehicle: document.querySelector('input[name="vehicle"]:checked')?.value || 'sedan',
          service: document.getElementById('service').value,
          name: document.getElementById('name').value,
          contact: document.getElementById('contact').value,
          email: customerEmail,
          details: document.getElementById('details').value || '(none)',
          status: 'confirmed'
        };

        // Save to Supabase
        const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(formData)
        });

        if (!supabaseRes.ok) {
          const errText = await supabaseRes.text();
          throw new Error(`Supabase insert failed: ${supabaseRes.status} – ${errText}`);
        }
        console.log("Booking saved to Supabase successfully");

        // ── Send confirmation email via MailerSend ──
        if (customerEmail && customerEmail.includes('@')) {
          console.log("Sending MailerSend confirmation to:", customerEmail);

          const mailerSendData = {
            from: {
              email: "support@yaadtriptours.com",
              name: "Yaadtrip Tours"
            },
            to: [{ email: customerEmail }],
            subject: `Yaadtrip Tours Booking Confirmation - ${trackingCode}`,
            html: `
              <h2>Hi ${formData.name},</h2>
              <p>Thank you for booking with Yaadtrip Tours!</p>
              <h3>Your Booking Details</h3>
              <ul>
                <li><strong>Tracking Code:</strong> ${trackingCode}</li>
                <li><strong>Amount:</strong> $${currentTotalPrice.toFixed(2)} USD</li>
                <li><strong>Transaction ID:</strong> ${transactionId || 'N/A'}</li>
                <li><strong>Pickup:</strong> ${formData.pickup}</li>
                <li><strong>Drop-off:</strong> ${formData.dropoff}</li>
                <li><strong>Date & Time:</strong> ${new Date(formData.datetime).toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}</li>
                <li><strong>Passengers:</strong> ${formData.passengers}</li>
                <li><strong>Vehicle:</strong> ${formData.vehicle.charAt(0).toUpperCase() + formData.vehicle.slice(1)}</li>
                <li><strong>Service:</strong> ${formData.service}</li>
                <li><strong>Contact:</strong> ${formData.contact}</li>
                <li><strong>Email:</strong> ${customerEmail}</li>
                <li><strong>Additional Details:</strong> ${formData.details || 'None'}</li>
              </ul>
              <p>We’ll contact you soon to confirm everything. Safe travels!</p>
              <p>Best regards,<br>Yaadtrip Tours Support<br>support@yaadtriptours.com</p>
            `
          };

          const mailerRes = await fetch('https://api.mailersend.com/v1/email', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${MAILERSEND_API_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(mailerSendData)
          });

          if (!mailerRes.ok) {
            const errText = await mailerRes.text();
            console.error("MailerSend customer email failed:", errText);
          } else {
            console.log("Customer email sent via MailerSend successfully");
          }
        } else {
          console.warn("No valid customer email – skipping customer send");
        }

        // Always send copy to support
        const supportMailerData = {
          from: {
            email: "support@yaadtriptours.com",
            name: "Yaadtrip Tours"
          },
          to: [{ email: "support@yaadtriptours.com" }],
          subject: `New Booking Received - ${trackingCode}`,
          html: `
            <h2>New Booking</h2>
            <p><strong>Customer:</strong> ${formData.name} (${customerEmail || 'Not provided'})</p>
            <p><strong>Tracking Code:</strong> ${trackingCode}</p>
            <p><strong>Amount:</strong> $${currentTotalPrice.toFixed(2)} USD</p>
            <p><strong>Pickup:</strong> ${formData.pickup}</p>
            <p><strong>Drop-off:</strong> ${formData.dropoff}</p>
          `
        };

        await fetch('https://api.mailersend.com/v1/email', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${MAILERSEND_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(supportMailerData)
        }).catch(err => console.error("Support copy failed:", err));

        localStorage.setItem('trackingCode', trackingCode);

        window.location.href = '/thank-you.html';

      } catch (err) {
        console.error('onApprove error:', err);
        alert(
          'Payment was successful, but confirmation failed.\n\n' +
          `Tracking code: ${trackingCode}\n` +
          `Error: ${err.message || 'Unknown'}\n\n` +
          'Please contact support@yaadtriptours.com'
        );
      }
    },

    onCancel: () => {
      alert('Payment was cancelled.');
    },

    onError: (err) => {
      console.error('PayPal Button Error:', err);
      alert('There was a problem with PayPal. Please try again or contact support.');
    }

  }).render('#paypal-button-container')
    .then(() => console.log("PayPal buttons rendered successfully"))
    .catch(err => console.error("PayPal render failed:", err));
}

// ────────────────────────────────────────────────
// GOOGLE PLACES AUTOCOMPLETE
// ────────────────────────────────────────────────
let pickupPlace = null;
let dropoffPlace = null;
let pickupAutocomplete, dropoffAutocomplete;

function initAutocomplete() {
  console.log("Google Maps API called initAutocomplete – success!");

  const options = {
    componentRestrictions: { country: 'jm' },
    fields: ['geometry', 'formatted_address']
  };

  const pickupInput  = document.getElementById('pickup');
  const dropoffInput = document.getElementById('dropoff');

  if (!pickupInput || !dropoffInput) {
    console.error("Pickup or dropoff input not found");
    return;
  }

  pickupAutocomplete  = new google.maps.places.Autocomplete(pickupInput, options);
  dropoffAutocomplete = new google.maps.places.Autocomplete(dropoffInput, options);

  pickupAutocomplete.addListener('place_changed', () => {
    pickupPlace = pickupAutocomplete.getPlace();
    if (pickupPlace?.geometry) {
      console.log("Pickup selected:", pickupPlace.formatted_address);
      updatePrice();
    }
  });

  dropoffAutocomplete.addListener('place_changed', () => {
    dropoffPlace = dropoffAutocomplete.getPlace();
    if (dropoffPlace?.geometry) {
      console.log("Dropoff selected:", dropoffPlace.formatted_address);
      updatePrice();
    }
  });
}

// ────────────────────────────────────────────────
// EVENT LISTENERS
// ────────────────────────────────────────────────
document.querySelectorAll('input, select').forEach(el => {
  el.addEventListener('change', updatePrice);
  el.addEventListener('input', updatePrice);
});

// Initial call
updatePrice();