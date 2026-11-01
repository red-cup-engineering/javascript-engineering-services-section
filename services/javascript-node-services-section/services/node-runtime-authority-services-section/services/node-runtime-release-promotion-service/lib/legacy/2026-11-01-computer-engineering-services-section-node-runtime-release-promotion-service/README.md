# Node runtime release promotion service

This service atomically moves a deployment pointer such as `current` to one
verified release digest.  The displaced digest is retained at `previous`, and
each transition is recorded as a JSON receipt.  Selecting the previous digest
is an ordinary promotion and therefore produces its own rollback receipt.
