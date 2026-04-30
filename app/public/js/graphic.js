// graphic.js
// Handles graphical authentication click.
// The endpoint (/click or /register-click) is set by the HTML page
// via a data-endpoint attribute on the #box element.

function click_box() {
    const box = document.getElementById('box');
    if (!box) {
        console.error('graphic.js: #box element not found');
        return;
    }

    const endpoint = box.dataset.endpoint || '/click';
    console.log(`graphic.js: using endpoint ${endpoint}`);

    box.addEventListener('mousedown', async function(event) {
        const img  = document.getElementById('number_box');
        const rect = img ? img.getBoundingClientRect() : box.getBoundingClientRect();

        // Calculate relative position within the image
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // The image is a 10x10 grid — calculate cell size from actual rendered dimensions
        // This ensures n is consistent regardless of screen size or zoom level
        const cellW = rect.width  / 10;
        const cellH = rect.height / 10;

        const col = Math.floor(x / cellW);
        const row = Math.floor(y / cellH);
        const n   = col + 1 + row * 10;

        console.log(`Image size: ${Math.round(rect.width)}x${Math.round(rect.height)}`);
        console.log(`Cell size: ${cellW.toFixed(1)}x${cellH.toFixed(1)}`);
        console.log(`Click: x=${Math.round(x)}, y=${Math.round(y)}, col=${col}, row=${row}, n=${n}`);

        // Validate click is within image bounds
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
            console.log('Click outside image bounds');
            return;
        }

        // Show loading state
        const hint = document.getElementById('click_hint');
        if (hint) {
            hint.textContent = 'Verifying...';
            hint.style.color = '#7a9cc4';
        }

        try {
            const res  = await fetch(endpoint, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ x: Math.round(x), y: Math.round(y), n })
            });

            const data = await res.json();
            console.log('Response:', data);

            if (data.redirect) {
                window.location.href = data.redirect;
            } else if (data.error) {
                if (hint) {
                    hint.textContent = data.error;
                    hint.style.color = '#a32d2d';
                }
            }

        } catch (err) {
            console.error('Graphic click error:', err);
            if (hint) {
                hint.textContent = 'Something went wrong. Please try again.';
                hint.style.color = '#a32d2d';
            }
        }
    });

    console.log('graphic.js: click handler attached to #box');
}