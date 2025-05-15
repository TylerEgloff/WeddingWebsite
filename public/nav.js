const fullNav = document.getElementById('fullNav');
const navToggler = document.querySelector('.navbar-toggler');
const navLinks = fullNav.querySelectorAll('a');

function toggleNav() {
    fullNav.classList.toggle('show');
    document.body.classList.toggle('nav-open', fullNav.classList.contains('show'));
}

navToggler.onclick = toggleNav;

navLinks.forEach(link => {
    link.onclick = () => {
        fullNav.classList.remove('show');
        document.body.classList.remove('nav-open');
    };
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        fullNav.classList.remove('show');
        document.body.classList.remove('nav-open');
    }
});