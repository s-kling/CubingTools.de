document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search).get('dir');

    if (params) {
        document.getElementById(
            'message'
        ).innerHTML = `<h2>The directory ${window.location.hostname}/${params} doesn't exist. If you think this is a mistake, please refer to our <a href="mailto:info@cubingtools.de">email</a>.</h2>`;
    } else {
        document.getElementById(
            'message'
        ).innerHTML = `<h2>The requested page doesn't exist. If you think this is a mistake, please refer to our <a href="mailto:info@cubingtools.de">email</a>.</h2>`;
    }
});
