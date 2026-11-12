#!/bin/bash
# Meeting Copilot - start on a Mac. Double-click it in Finder.
#
# Launched with `open` on purpose: macOS then asks for the Microphone and
# Screen & System Audio Recording permissions for "Electron" itself. Started
# straight from Terminal, the permissions would be charged to Terminal instead.
cd "$(dirname "$0")"
APP="node_modules/electron/dist/Electron.app"
[ -d "$APP" ] || { echo "Not set up yet - run SETUP-MAC.command first."; read -n1; exit 1; }
[ -x audio/mac/syscap ] || swiftc -O -o audio/mac/syscap audio/mac/syscap.swift
open -n "$APP" --args "$PWD"
echo "Meeting Copilot started. You can close this window."
