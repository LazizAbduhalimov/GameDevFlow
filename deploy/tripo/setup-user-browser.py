#!/usr/bin/env python3
"""Install an isolated, persistent Tripo Studio browser for the current Linux user."""
import argparse
import os
from pathlib import Path
import secrets
import shlex
import shutil
import socket
import string
import subprocess


def run(*args, cwd=None, env=None):
    subprocess.run(args, cwd=cwd, env=env, check=True)


def write_private(path, text, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    path.chmod(mode)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8084)
    parser.add_argument("--project", type=Path, default=Path.home() / "consept")
    args = parser.parse_args()
    home = Path.home()
    root = home / ".local/share/consept-tripo"
    config = home / ".config/consept/tripo"
    units = home / ".config/systemd/user"
    downloads = root / "downloads"
    for folder in (root, config, units, downloads):
        folder.mkdir(parents=True, exist_ok=True)
    config.chmod(0o700)

    display_active = subprocess.run(["systemctl", "--user", "is-active", "--quiet",
                                     "consept-tripo-display.service"]).returncode == 0
    if Path("/tmp/.X11-unix/X88").exists() and not display_active:
        raise RuntimeError("Display :88 is already used by another service.")

    # Refuse ports already used by services outside this browser deployment.
    for host, port, unit in ((args.host, args.port, "consept-tripo-web.service"),
                             ("127.0.0.1", 5904, "consept-tripo-vnc.service"),
                             ("127.0.0.1", 9333, "consept-tripo-browser.service")):
        active = subprocess.run(["systemctl", "--user", "is-active", "--quiet", unit]).returncode == 0
        if not active:
            with socket.socket() as probe:
                probe.bind((host, port))

    chrome_deb = downloads / "google-chrome-stable.deb"
    chrome = root / "opt/google/chrome/chrome"
    if not chrome.exists():
        run("curl", "--fail", "--location", "--retry", "2", "--max-time", "300",
            "--output", str(chrome_deb),
            "https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb")
        run("dpkg-deb", "--extract", str(chrome_deb), str(root))
    if not (root / "usr/bin/x11vnc").exists():
        run("apt-get", "download", "x11vnc", "libvncserver1", "libvncclient1", cwd=downloads)
        for package in downloads.glob("*.deb"):
            if package != chrome_deb:
                run("dpkg-deb", "--extract", str(package), str(root))

    for name, tag in (("noVNC", "v1.7.0"), ("websockify", "v0.13.0")):
        if not (root / name / ".git").exists():
            run("git", "clone", "--depth", "1", "--branch", tag,
                f"https://github.com/novnc/{name}.git", str(root / name))

    runtime_env = os.environ.copy()
    runtime_env["LD_LIBRARY_PATH"] = str(root / "usr/lib/x86_64-linux-gnu")
    runtime_env["PYTHONPATH"] = str(root / "websockify")
    run(str(root / "usr/bin/x11vnc"), "-version", env=runtime_env)
    run("python3", "-m", "websockify", "--help", env=runtime_env)
    for binary in (chrome, root / "usr/bin/x11vnc"):
        libraries = subprocess.check_output(["ldd", str(binary)], text=True, env=runtime_env)
        if "not found" in libraries:
            raise RuntimeError(f"Missing runtime libraries for {binary}:\n{libraries}")

    password_file = config / "browser.password"
    if not password_file.exists():
        password = "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(8))
        write_private(password_file, password + "\n")
    password = password_file.read_text().strip()
    run(str(root / "usr/bin/x11vnc"), "-storepasswd", password, str(config / "vnc.pass"), env=runtime_env)
    (config / "vnc.pass").chmod(0o600)
    authority = config / "Xauthority"
    if not authority.exists():
        authority.touch(mode=0o600)
        run("xauth", "-f", str(authority), "add", ":88", ".", secrets.token_hex(16))

    # Ubuntu restricts unprivileged user namespaces. Its existing Chrome profile
    # permits the browser sandbox without changing system policy or --no-sandbox.
    apparmor = bool(shutil.which("aa-exec")) and subprocess.run(
        ["aa-exec", "-p", "chrome", "--", "/bin/true"], capture_output=True).returncode == 0
    browser_command = (["/usr/bin/aa-exec", "-p", "chrome", "--"] if apparmor else []) + [str(chrome)]
    profile = args.project / "data/tripo-browser-profile"
    profile.mkdir(parents=True, exist_ok=True)
    profile.chmod(0o700)
    browser_command += ["--remote-debugging-address=127.0.0.1", "--remote-debugging-port=9333",
                        f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check",
                        "--use-gl=angle", "--use-angle=gl", "--ignore-gpu-blocklist",
                        "--window-position=0,0", "--window-size=1600,900", "--new-window",
                        "https://studio.tripo3d.ai/ru/workspace/generate"]
    write_private(root / "start-browser.sh", "#!/bin/sh\nexec " + shlex.join(browser_command) + "\n", 0o700)

    common = "\nRestart=on-failure\nRestartSec=3\nUMask=0077\n\n[Install]\nWantedBy=default.target\n"
    display_env = f"Environment=DISPLAY=:88\nEnvironment=XAUTHORITY={authority}\n"
    write_private(units / "consept-tripo-display.service",
                  "[Unit]\nDescription=Consept Tripo virtual display\n\n[Service]\nType=simple\n"
                  f"ExecStart=/usr/bin/Xvfb :88 -screen 0 1600x900x24 -nolisten tcp -auth {authority}" + common)
    dependency = "Requires=consept-tripo-display.service\nAfter=consept-tripo-display.service\n"
    write_private(units / "consept-tripo-browser.service",
                  "[Unit]\nDescription=Consept Tripo Studio browser\n" + dependency +
                  "\n[Service]\nType=simple\n" + display_env +
                  f"ExecStart={root}/start-browser.sh" + common)
    write_private(units / "consept-tripo-vnc.service",
                  "[Unit]\nDescription=Consept Tripo browser remote screen\n" + dependency +
                  "\n[Service]\nType=simple\n" + display_env +
                  f"Environment=LD_LIBRARY_PATH={runtime_env['LD_LIBRARY_PATH']}\n"
                  f"ExecStart={root}/usr/bin/x11vnc -display :88 -auth {authority} -localhost "
                  f"-rfbport 5904 -rfbauth {config}/vnc.pass -forever -shared -noxdamage" + common)
    write_private(units / "consept-tripo-web.service",
                  "[Unit]\nDescription=Consept Tripo browser web viewer\n"
                  "Requires=consept-tripo-vnc.service\nAfter=consept-tripo-vnc.service\n"
                  "\n[Service]\nType=simple\n"
                  f"Environment=PYTHONPATH={runtime_env['PYTHONPATH']}\n"
                  f"ExecStart=/usr/bin/python3 -m websockify --web {root}/noVNC --heartbeat 30 "
                  f"{args.host}:{args.port} 127.0.0.1:5904" + common)

    server_env = home / ".config/consept/server.env"
    updates = {"DISPLAY": ":88", "XAUTHORITY": str(authority),
               "CONSEPT_TRIPO_BROWSER_PATH": str(root / "start-browser.sh")}
    lines = server_env.read_text().splitlines() if server_env.exists() else []
    lines = [line for line in lines if line.split("=", 1)[0] not in updates]
    lines += [f"{key}={shlex.quote(value)}" for key, value in updates.items()]
    write_private(server_env, "\n".join(lines) + "\n")
    run("systemctl", "--user", "daemon-reload")
    run("systemctl", "--user", "enable", "--now", "consept-tripo-display.service",
        "consept-tripo-browser.service", "consept-tripo-vnc.service", "consept-tripo-web.service")
    print(f"Browser viewer: http://{args.host}:{args.port}/vnc.html?autoconnect=1&resize=scale")
    print(f"Viewer password file: {password_file}")
    print("Sign in manually in the remote browser; the profile stays on this server.")


if __name__ == "__main__":
    main()
