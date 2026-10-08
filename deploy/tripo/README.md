# Tripo Studio on a Linux server

The existing Tripo action uploads images into a browser and waits for the user
to press Generate in Studio. It uses the saved Studio browser login and its
Studio credits. Tripo API has a separate balance and is not configured here.

Install the browser under the same Linux user as Consept:

```sh
python3 deploy/tripo/setup-user-browser.py --host 192.168.12.231 --port 8084
systemctl --user restart consept.service
```

The setup requires an existing Xvfb, xauth, Python 3, Git, curl, apt-get, and
dpkg-deb. Downloads and extracted packages stay in `~/.local/share/consept-tripo`;
system packages and other services are not changed. On Ubuntu, the existing
Chrome AppArmor profile enables its user-namespace sandbox.

Open `http://192.168.12.231:8084/vnc.html?autoconnect=1&resize=scale` and enter the
viewer password from `~/.config/consept/tripo/browser.password`. Sign in to Tripo
yourself. The browser profile is `~/consept/data/tripo-browser-profile`. Do not
copy another computer's browser profile or put account credentials in Git.

Four user services persist the screen, Chrome, VNC, and web viewer. Chrome's
debugging port 9333 and VNC port 5904 listen only on loopback. The viewer binds
to the explicitly supplied LAN address and requires its own VNC password.
The browser sandbox is retained. Existing ports are checked before installation.

Once signed in, keep the viewer open, send an image using the Tripo button in
Consept, and manually start Generate in the remote Studio tab. Consept watches
the result and imports the GLB using the existing bridge. Only one Studio tab
and active model watcher are supported by this bridge; coordinate shared use.

To close remote access while keeping Chrome and its login running:

```sh
systemctl --user stop consept-tripo-web.service consept-tripo-vnc.service
```

To reopen it, start both units. To stop the entire dedicated browser, stop its
browser, web, VNC, and display units. Account sign-in, uploading, and a complete
generation must be verified separately; installation alone does not verify them.
