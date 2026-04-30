// Login form handler
const loginForm = document.getElementById('login_form');

loginForm.addEventListener('submit', async function(e) {
    // Prevent ANY form submission — JS handles everything
    e.preventDefault();
    e.stopPropagation();

    const username = document.querySelector('input[name="username_input"]').value.trim();
    const password = document.querySelector('input[name="password_input"]').value;

    // Client-side empty field check
    if (!username || !password) {
        showLoginError('You must fill out login fields.');
        return;
    }

    const btn = document.getElementById('login_btn');
    btn.disabled    = true;
    btn.textContent = 'Signing in...';

    try {
        const response = await fetch('/password', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username_input: username, password_input: password })
        });

        const result = await response.json();

        if (!result.success) {
            showLoginError(result.error || 'Invalid login information.');
            btn.disabled    = false;
            btn.textContent = 'Sign in';
        } else {
            // redirectTo comes from /password route
            window.location.href = result.redirectTo;
        }

    } catch (err) {
        console.error('Login error', err);
        showLoginError('Server error, please try again.');
        btn.disabled    = false;
        btn.textContent = 'Sign in';
    }
});

// Show an inline error message above the submit button
function showLoginError(message) {
    const existing = document.getElementById('login_error');
    if (existing) existing.remove();

    const error_msg         = document.createElement('p');
    error_msg.id            = 'login_error';
    error_msg.textContent   = message;
    error_msg.style.color       = '#a32d2d';
    error_msg.style.fontSize    = '13px';
    error_msg.style.marginBottom = '0.8rem';

    const btn = document.querySelector('#login_btn');
    btn.parentNode.insertBefore(error_msg, btn);
}

// Register button — redirects to /register page
const registerBtn = document.getElementById('register-btn');
if (registerBtn) {
    registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        document.location.href = '/register';
    });
}