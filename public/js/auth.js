document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorMessage = document.getElementById('error-message');

    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    verifyAuthState();
});

/**
 @param {Event} event
 */
async function handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorMessage = document.getElementById('error-message');

    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'Erro ao fazer login');
        }

        const data = await response.json();

        // Armazena os dados de autenticação
        localStorage.setItem('jwtToken', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        redirectByUserRole(data.user.role);

    } catch (error) {
        console.error('Erro no login:', error);
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
    }
}

/**
 * Redireciona o usuário com base no seu role
 * @param {string} role
 */
function redirectByUserRole(role) {
    let redirectPage = 'index.html';
    
    switch (role) {
        case 'gestor_rotas':
            redirectPage = 'dashboard-gestor.html';
            break;
        case 'vistoriador':
            redirectPage = 'dashboard-vistoriador.html';
            break;
        case 'visualizador_vistorias':
            redirectPage = 'dashboard-visualizador.html';
            break;
        default:
            console.error('Role desconhecido:', role);
            break;
    }

    window.location.href = redirectPage;
}


function verifyAuthState() {
    const token = localStorage.getItem('jwtToken');
    const userString = localStorage.getItem('user');

    if (!token || !userString) {
        if (window.location.pathname !== '/index.html' && !window.location.pathname.endsWith('/')) {
            window.location.href = 'index.html?redirect=' + encodeURIComponent(window.location.pathname);
        }
        return;
    }

    try {
        const user = JSON.parse(userString);
        
        verifyPagePermissions(user);

        const userNameElement = document.getElementById('userName');
        if (userNameElement) {
            userNameElement.textContent = user.name;
        }

        const userRoleElement = document.getElementById('userRole');
        if (userRoleElement) {
            userRoleElement.textContent = formatUserRole(user.role);
        }

    } catch (error) {
        console.error('Erro ao verificar autenticação:', error);
        if (window.location.pathname !== '/index.html') {
            window.location.href = 'index.html';
        }
    }
}

/**
 * @param {object} user
 */
function verifyPagePermissions(user) {
    const pageRoles = {
        '/dashboard-gestor.html': ['gestor_rotas'],
        '/dashboard-vistoriador.html': ['vistoriador'],
        '/dashboard-visualizador.html': ['visualizador_vistorias', 'gestor_rotas', 'vistoriador']
    };

    const currentPath = window.location.pathname;
    const allowedRoles = pageRoles[currentPath];

    if (allowedRoles && !allowedRoles.includes(user.role)) {
        displayMessage('Acesso não autorizado');
        setTimeout(() => {
            redirectByUserRole(user.role);
        }, 2000);
    }
}

/**
 * @param {string} role
 * @returns {string}
 */
function formatUserRole(role) {
    const rolesMap = {
        'gestor_rotas': 'Gestor de Rotas',
        'vistoriador': 'Vistoriador',
        'visualizador_vistorias': 'Visualizador'
    };
    return rolesMap[role] || role;
}

/**
 * @param {string} message
 */
function displayMessage(message) {
    const messageElement = document.getElementById('message');
    if (messageElement) {
        messageElement.textContent = message;
        messageElement.style.display = 'block';
        setTimeout(() => {
            messageElement.style.display = 'none';
        }, 3000);
    }
}


function logout() {
    localStorage.removeItem('jwtToken');
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
}
