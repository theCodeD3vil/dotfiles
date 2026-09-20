#!/bin/sh
# Print the Nerd Font logo of the OS/distro tmux runs on, for the session pill.
# macOS -> apple, Windows (WSL, MSYS2/Git Bash, Cygwin) -> windows, Linux ->
# its distro logo (by /etc/os-release ID) or tux when Nerd Fonts has none.

# Codepoint (hex) -> UTF-8 bytes. POSIX printf has no \u escape (macOS
# /bin/sh is bash 3.2), so encode by hand. Only 3- and 4-byte ranges needed.
glyph() {
  cp=$((0x$1))
  if [ "$cp" -lt 65536 ]; then
    printf "\\$(printf %o $((0xE0 | cp >> 12)))\\$(printf %o $((0x80 | (cp >> 6 & 0x3F))))\\$(printf %o $((0x80 | (cp & 0x3F))))"
  else
    printf "\\$(printf %o $((0xF0 | cp >> 18)))\\$(printf %o $((0x80 | (cp >> 12 & 0x3F))))\\$(printf %o $((0x80 | (cp >> 6 & 0x3F))))\\$(printf %o $((0x80 | (cp & 0x3F))))"
  fi
}

linux_distro() {
  # Subshell so os-release's variables don't leak.
  id=$( [ -r /etc/os-release ] && . /etc/os-release && echo "$ID" )
  case "$id" in
    ubuntu)              echo F31B ;; # linux-ubuntu
    fedora)              echo F30A ;; # linux-fedora
    arch)                echo F303 ;; # linux-archlinux
    debian)              echo F306 ;; # linux-debian
    linuxmint)           echo F30E ;; # linux-linuxmint
    manjaro)             echo F312 ;; # linux-manjaro
    nixos)               echo F313 ;; # linux-nixos
    opensuse-tumbleweed) echo F37D ;; # linux-tumbleweed
    opensuse-leap)       echo F37E ;; # linux-leap
    opensuse*)           echo F314 ;; # linux-opensuse
    gentoo)              echo F30D ;; # linux-gentoo
    alpine)              echo F300 ;; # linux-alpine
    centos)              echo F304 ;; # linux-centos
    rhel)                echo F316 ;; # linux-redhat
    rocky)               echo F32B ;; # linux-rocky_linux
    almalinux)           echo F31D ;; # linux-almalinux
    pop)                 echo F32A ;; # linux-pop_os
    endeavouros)         echo F322 ;; # linux-endeavour
    void)                echo F32E ;; # linux-void
    kali)                echo F327 ;; # linux-kali_linux
    elementary)          echo F309 ;; # linux-elementary
    zorin)               echo F32F ;; # linux-zorin
    garuda)              echo F337 ;; # linux-garuda
    cachyos)             echo F385 ;; # linux-cachyos
    nobara)              echo F380 ;; # linux-nobara
    raspbian)            echo F315 ;; # linux-raspberry_pi
    slackware)           echo F318 ;; # linux-slackware
    solus)               echo F32D ;; # linux-solus
    artix)               echo F31F ;; # linux-artix
    mageia)              echo F310 ;; # linux-mageia
    deepin)              echo F321 ;; # linux-deepin
    parrot)              echo F329 ;; # linux-parrot
    neon)                echo F331 ;; # linux-kde_neon
    postmarketos)        echo F374 ;; # linux-postmarketos
    guix)                echo F325 ;; # linux-gnu_guix
    *)                   echo F31A ;; # linux-tux
  esac
}

case "$(uname -s)" in
  Darwin) cp=F302 ;;                  # linux-apple
  MINGW* | MSYS* | CYGWIN*) cp=F05B3 ;; # md-microsoft_windows
  FreeBSD) cp=F30C ;;                 # linux-freebsd
  OpenBSD) cp=F328 ;;                 # linux-openbsd
  Linux)
    if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
      cp=F05B3                        # WSL: the machine is Windows
    else
      cp=$(linux_distro)
    fi
    ;;
  *) cp=F31A ;;                       # linux-tux
esac

glyph "$cp"
