"""Fetchers for the open datasets the pipeline compiles. Each writes into the cache directory
and is safe to re-run: existing files are reused unless they are older than their refresh age."""
