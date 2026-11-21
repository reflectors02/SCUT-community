SCUT community rankings prototype

Requires PHP 8.0 or newer. No npm packages or database extension needed.

From the SCUT-community directory run:
    php -S localhost:8000 -t public
Visit http://localhost:8000 in a browser. Stop with Ctrl+C.

The data directory must be writable by the PHP process. It is outside the public web root.
For a public server, point its document root to public/ and make data/ writable.

Save draft keeps your work in your browser. Submit rankings writes to
data/submissions.json and updates the shared average. Submitting again from
the same browser replaces your earlier submission; a new browser is a new
participant. Unranked items are omitted. Average scores round to the nearest
tier, with half values rounding upward (S=5, A=4, B=3, C=2, D=1, F=0).

This is an anonymous course prototype. It does not verify SCU identity or
prevent one person from voting from multiple browsers. 
