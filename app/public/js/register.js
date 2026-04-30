// Registration form handler — Step 1: credentials
const registerForm = document.getElementById('register_form');

registerForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('username_input').value.trim();
    const password = document.getElementById('password_input').value;

    const errorEl = document.getElementById('error_msg');
    errorEl.classList.remove('visible');

    // Client-side validation
    if (!username || !password) {
        errorEl.textContent = 'Please fill in all fields.';
        errorEl.classList.add('visible');
        return;
    }

    if (username.length < 3) {
        errorEl.textContent = 'Username must be at least 3 characters.';
        errorEl.classList.add('visible');
        return;
    }

    if (password.length < 8) {
        errorEl.textContent = 'Password must be at least 8 characters.';
        errorEl.classList.add('visible');
        return;
    }

    const btn = document.getElementById('register_btn');
    btn.disabled    = true;
    btn.textContent = 'Checking...';

    try {
        const response = await fetch('/register-init', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username_input: username, password_input: password })
        });

        const result = await response.json();

        if (!result.success) {
            errorEl.textContent = result.error || 'Registration failed. Please try again.';
            errorEl.classList.add('visible');
            btn.disabled    = false;
            btn.textContent = 'Continue';
        } else {
            // Move to step 2 — graphic challenge
            window.location.href = result.redirectTo;
        }

    } catch (err) {
        console.error('Registration error:', err);
        errorEl.textContent = 'Server error. Please try again.';
        errorEl.classList.add('visible');
        btn.disabled    = false;
        btn.textContent = 'Continue';
    }
});