"""Tests for upload_and_mint helper script."""

import json
import os
import tempfile
import pytest

from scripts.upload_and_mint import ModelMetadata, compute_sha256


class TestModelMetadata:
    def test_to_token_uri_json_contains_required_fields(self):
        meta = ModelMetadata(
            name="TestModel",
            description="A test model",
            model_hash_sha256="abc123",
            storage_cid="QmTest",
            storage_type="ipfs",
            architecture="ResNet-50",
            training_dataset_hash="dataset123",
        )
        data = json.loads(meta.to_token_uri_json())

        assert data["name"] == "TestModel"
        assert data["model_hash_sha256"] == "abc123"
        assert data["storage_cid"] == "QmTest"
        assert data["storage_type"] == "ipfs"
        assert data["architecture"] == "ResNet-50"
        assert data["training_dataset_hash"] == "dataset123"

    def test_to_token_uri_json_has_all_issue_4_fields(self):
        """Issue #4 requires: model hash, storage CID, architecture, dataset hash."""
        meta = ModelMetadata(
            name="M",
            description="D",
            model_hash_sha256="sha256hash",
            storage_cid="bTx4r9...arweave",
            storage_type="arweave",
            architecture="LLaMA-7B, transformers",
            training_dataset_hash="ds_hash_256",
        )
        data = json.loads(meta.to_token_uri_json())

        assert "model_hash_sha256" in data
        assert "storage_cid" in data
        assert "architecture" in data
        assert "training_dataset_hash" in data

    def test_default_version(self):
        meta = ModelMetadata(
            name="X", description="", model_hash_sha256="", storage_cid="",
            storage_type="ipfs", architecture="", training_dataset_hash="",
        )
        data = json.loads(meta.to_token_uri_json())
        assert data["version"] == "1.0.0"

    def test_arweave_storage_type(self):
        meta = ModelMetadata(
            name="X", description="", model_hash_sha256="", storage_cid="ar_tx_id",
            storage_type="arweave", architecture="", training_dataset_hash="",
        )
        data = json.loads(meta.to_token_uri_json())
        assert data["storage_type"] == "arweave"
        assert data["storage_cid"] == "ar_tx_id"


class TestComputeSHA256:
    def test_correct_hash(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            f.write(b"hello world")
            path = f.name

        result = compute_sha256(path)
        # SHA-256 of "hello world" is well-known
        assert result == "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        os.unlink(path)

    def test_empty_file_hash(self):
        with tempfile.NamedTemporaryFile(delete=False) as f:
            path = f.name

        result = compute_sha256(path)
        # SHA-256 of empty string
        assert result == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        os.unlink(path)

    def test_large_file_hash(self):
        """Test that large files are hashed correctly (chunked reading)."""
        with tempfile.NamedTemporaryFile(delete=False) as f:
            # Write 1MB of data
            f.write(b"x" * (1024 * 1024))
            path = f.name

        result = compute_sha256(path)
        assert len(result) == 64  # SHA-256 hex length
        os.unlink(path)

    def test_different_files_different_hashes(self):
        with tempfile.NamedTemporaryFile(delete=False) as f1:
            f1.write(b"file1")
            path1 = f1.name
        with tempfile.NamedTemporaryFile(delete=False) as f2:
            f2.write(b"file2")
            path2 = f2.name

        assert compute_sha256(path1) != compute_sha256(path2)
        os.unlink(path1)
        os.unlink(path2)
