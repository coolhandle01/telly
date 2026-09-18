# Documentation

Two shelves, and the difference between them is *when* you reach for one.

| | |
|---|---|
| **[architecture/](architecture/)** | How the thing is built, and why it is built that way. Read before changing code. |
| **[research/](research/)** | What was learned before the code was written: the period detail, the physics, the design idiom. Read before changing how it *looks*. |

A rough rule: if getting it wrong breaks a test, it belongs in `architecture/`.
If getting it wrong merely makes the set look like a render of a television
rather than a television, it belongs in `research/`.

Security sits on the first shelf:
[architecture/threat-model.md](architecture/threat-model.md) holds the trust
boundaries, the data-flow diagram and every threat with its disposition. Read it
before touching sign-in, the cache, or anything that leaves the origin.

The front door for *using* telly is the [top-level README](../README.md);
[CONTRIBUTING.md](../CONTRIBUTING.md) has the scripts and the gates, and
[SECURITY.md](../SECURITY.md) has what is stored where.
