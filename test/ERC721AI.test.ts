import { expect } from "chai";
import { ethers } from "hardhat";
import { ERC721AI } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("ERC721AI", function () {
  let contract: ERC721AI;
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;

  // Dummy test values
  const MODEL_HASH = ethers.id("model-weights-v1"); // keccak → bytes32 stand-in
  const DATASET_HASH = ethers.id("imagenet-2024");
  const STORAGE_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";
  const ARWEAVE_TXN = "arweave_tx_abc123";
  const ARCHITECTURE = "ResNet-50";
  const METADATA_URI = "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ERC721AI");
    contract = (await Factory.deploy()) as unknown as ERC721AI;
    await contract.waitForDeployment();
  });

  // ── Minting ──────────────────────────────────────────────────────────────

  describe("mintModel", function () {
    it("should mint a token and store metadata", async function () {
      const tx = await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        ARWEAVE_TXN,
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );
      const receipt = await tx.wait();

      // Token ID 1
      expect(await contract.ownerOf(1)).to.equal(alice.address);
      expect(await contract.totalSupply()).to.equal(1);

      // Check ModelMinted event
      const event = receipt?.logs.find((l: any) => l.fragment?.name === "ModelMinted");
      expect(event).to.not.be.undefined;
    });

    it("should reject minting with empty model hash", async function () {
      await expect(
        contract.mintModel(
          alice.address,
          ethers.ZeroHash,
          STORAGE_CID,
          ARWEAVE_TXN,
          ARCHITECTURE,
          DATASET_HASH,
          METADATA_URI
        )
      ).to.be.revertedWithCustomError(contract, "EmptyModelHash");
    });

    it("should reject minting with empty storage CID", async function () {
      await expect(
        contract.mintModel(
          alice.address,
          MODEL_HASH,
          "",
          ARWEAVE_TXN,
          ARCHITECTURE,
          DATASET_HASH,
          METADATA_URI
        )
      ).to.be.revertedWithCustomError(contract, "EmptyStorageCid");
    });

    it("should reject duplicate model hash", async function () {
      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        ARWEAVE_TXN,
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );

      await expect(
        contract.mintModel(
          owner.address,
          MODEL_HASH,
          "bafyother",
          "",
          "GPT-2",
          DATASET_HASH,
          METADATA_URI
        )
      ).to.be.revertedWithCustomError(contract, "ModelHashAlreadyRegistered");
    });

    it("should allow minting with empty arweave txn", async function () {
      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        "",
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );

      const meta = await contract.getModelMetadata(1);
      expect(meta.arweaveTxn).to.equal("");
    });
  });

  // ── tokenURI ─────────────────────────────────────────────────────────────

  describe("tokenURI", function () {
    it("should return the metadata URI", async function () {
      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        ARWEAVE_TXN,
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );

      expect(await contract.tokenURI(1)).to.equal(METADATA_URI);
    });

    it("should revert for non-existent token", async function () {
      await expect(contract.tokenURI(999)).to.be.reverted;
    });
  });

  // ── getModelMetadata ─────────────────────────────────────────────────────

  describe("getModelMetadata", function () {
    it("should return all stored fields", async function () {
      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        ARWEAVE_TXN,
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );

      const meta = await contract.getModelMetadata(1);
      expect(meta.modelHash).to.equal(MODEL_HASH);
      expect(meta.storageCid).to.equal(STORAGE_CID);
      expect(meta.arweaveTxn).to.equal(ARWEAVE_TXN);
      expect(meta.architecture).to.equal(ARCHITECTURE);
      expect(meta.trainingDatasetHash).to.equal(DATASET_HASH);
      expect(meta.metadataURI).to.equal(METADATA_URI);
    });
  });

  // ── verifyModelHash ──────────────────────────────────────────────────────

  describe("verifyModelHash", function () {
    beforeEach(async function () {
      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        ARWEAVE_TXN,
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );
    });

    it("should return true for matching hash", async function () {
      expect(await contract.verifyModelHash(1, MODEL_HASH)).to.be.true;
    });

    it("should return false for non-matching hash", async function () {
      const wrongHash = ethers.id("wrong-weights");
      expect(await contract.verifyModelHash(1, wrongHash)).to.be.false;
    });

    it("should revert for non-existent token", async function () {
      await expect(contract.verifyModelHash(999, MODEL_HASH)).to.be.reverted;
    });
  });

  // ── modelHashToTokenId ───────────────────────────────────────────────────

  describe("modelHashToTokenId", function () {
    it("should map model hash to token id", async function () {
      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        ARWEAVE_TXN,
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );

      expect(await contract.modelHashToTokenId(MODEL_HASH)).to.equal(1);
    });

    it("should return 0 for unknown hash", async function () {
      expect(await contract.modelHashToTokenId(ethers.id("unknown"))).to.equal(0);
    });
  });

  // ── Multiple mints ───────────────────────────────────────────────────────

  describe("sequential minting", function () {
    it("should increment token IDs", async function () {
      const hash2 = ethers.id("model-v2");

      await contract.mintModel(
        alice.address,
        MODEL_HASH,
        STORAGE_CID,
        "",
        ARCHITECTURE,
        DATASET_HASH,
        METADATA_URI
      );
      await contract.mintModel(
        owner.address,
        hash2,
        "bafyother",
        ARWEAVE_TXN,
        "GPT-2",
        DATASET_HASH,
        "ipfs://other"
      );

      expect(await contract.totalSupply()).to.equal(2);
      expect(await contract.ownerOf(1)).to.equal(alice.address);
      expect(await contract.ownerOf(2)).to.equal(owner.address);
    });
  });
});
