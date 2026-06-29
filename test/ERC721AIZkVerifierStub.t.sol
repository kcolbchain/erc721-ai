// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ERC721AI.sol";
import "../contracts/extensions/ERC721AIZkVerifierStub.sol";
import "./mocks/MockZkVerifier.sol";

contract ERC721AIZkVerifierStubTest is Test {
    ERC721AI internal erc721ai;
    ERC721AIZkVerifierStub internal stub;
    MockZkVerifier internal verifier;

    address internal admin;
    address internal creator;
    address internal alice;

    bytes32 internal constant MODEL_ID = keccak256("model-zk");
    bytes32 internal constant ARTIFACT_HASH = keccak256("weights-zk");

    event ProofSubmitted(uint256 indexed tokenId, bytes32 indexed proofHash, bool passed);

    function setUp() public {
        admin = makeAddr("admin");
        creator = makeAddr("creator");
        alice = makeAddr("alice");

        erc721ai = new ERC721AI("ERC-721 AI", "AI721");
        stub = new ERC721AIZkVerifierStub(address(erc721ai), admin);
        verifier = new MockZkVerifier();
    }

    function _mint() internal returns (uint256 tokenId) {
        vm.prank(creator);
        tokenId = erc721ai.mintModel(
            alice, MODEL_ID, ARTIFACT_HASH, bytes32(0), "ipfs://w", "arch", "MIT", "https://inf", 0
        );
    }

    function _proof() internal pure returns (uint256[] memory proof, uint256[] memory inputs) {
        proof = new uint256[](2);
        proof[0] = 1;
        proof[1] = 2;
        inputs = new uint256[](1);
        inputs[0] = uint256(ARTIFACT_HASH);
    }

    // ── Deployment ──────────────────────────────────────────────────────

    function test_Deployment() public view {
        assertEq(address(stub.erc721ai()), address(erc721ai));
        assertEq(stub.admin(), admin);
    }

    // ── submitProof: happy path ─────────────────────────────────────────

    function test_SubmitProofRecordsPassingVerification() public {
        uint256 tokenId = _mint();
        (uint256[] memory proof, uint256[] memory inputs) = _proof();
        bytes32 expectedProofHash = keccak256(abi.encode(proof, inputs));

        vm.expectEmit(true, true, false, true);
        emit ProofSubmitted(tokenId, expectedProofHash, true);
        stub.submitProof(tokenId, ARTIFACT_HASH, proof, inputs, address(verifier));

        assertEq(stub.getTokenProofHash(tokenId), expectedProofHash);

        ERC721AIZkVerifierStub.VerificationRecord memory rec = stub.getVerificationRecord(expectedProofHash);
        assertEq(rec.tokenId, tokenId);
        // The stub binds the record to the ON-CHAIN artifact hash, not the
        // caller-supplied one — this is the provenance anchor.
        assertEq(rec.artifactHash, ARTIFACT_HASH);
        assertEq(rec.proofHash, expectedProofHash);
        assertTrue(rec.passed);
        assertGt(rec.verifiedAt, 0);
    }

    function test_SubmitProofRecordsFailingVerification() public {
        uint256 tokenId = _mint();
        verifier.setResult(false);
        (uint256[] memory proof, uint256[] memory inputs) = _proof();
        bytes32 expectedProofHash = keccak256(abi.encode(proof, inputs));

        vm.expectEmit(true, true, false, true);
        emit ProofSubmitted(tokenId, expectedProofHash, false);
        stub.submitProof(tokenId, ARTIFACT_HASH, proof, inputs, address(verifier));

        ERC721AIZkVerifierStub.VerificationRecord memory rec = stub.getVerificationRecord(expectedProofHash);
        assertFalse(rec.passed);
        // Even a failing proof is recorded for auditability.
        assertEq(rec.tokenId, tokenId);
        assertGt(rec.verifiedAt, 0);
    }

    // ── submitProof: binds to on-chain artifact hash ────────────────────

    function test_RecordUsesOnChainArtifactHashNotCallerSupplied() public {
        uint256 tokenId = _mint();
        (uint256[] memory proof, uint256[] memory inputs) = _proof();
        bytes32 lie = keccak256("not-the-real-artifact");

        // Caller passes a bogus artifactHash; the stub ignores it and stores
        // the authoritative on-chain value.
        stub.submitProof(tokenId, lie, proof, inputs, address(verifier));

        bytes32 proofHash = keccak256(abi.encode(proof, inputs));
        ERC721AIZkVerifierStub.VerificationRecord memory rec = stub.getVerificationRecord(proofHash);
        assertEq(rec.artifactHash, ARTIFACT_HASH);
        assertTrue(rec.artifactHash != lie);
    }

    // ── submitProof: reverts ────────────────────────────────────────────

    function test_RevertWhenTokenNotFound() public {
        (uint256[] memory proof, uint256[] memory inputs) = _proof();
        // modelAsset reverts with TokenDoesNotExist for a nonexistent token.
        vm.expectRevert(ERC721AI.TokenDoesNotExist.selector);
        stub.submitProof(999, ARTIFACT_HASH, proof, inputs, address(verifier));
    }

    // ── proofHash determinism / mutation ────────────────────────────────

    function test_DifferentInputsProduceDifferentProofHash() public {
        uint256 tokenId = _mint();
        (uint256[] memory proof, uint256[] memory inputs) = _proof();
        stub.submitProof(tokenId, ARTIFACT_HASH, proof, inputs, address(verifier));
        bytes32 firstHash = stub.getTokenProofHash(tokenId);

        // Mutate a public input — the recorded proofHash for the token must change.
        inputs[0] = uint256(keccak256("different-input"));
        stub.submitProof(tokenId, ARTIFACT_HASH, proof, inputs, address(verifier));
        bytes32 secondHash = stub.getTokenProofHash(tokenId);

        assertTrue(firstHash != secondHash);
        // The original record is still retained (keyed by its own proofHash).
        assertEq(stub.getVerificationRecord(firstHash).tokenId, tokenId);
        assertEq(stub.getVerificationRecord(secondHash).tokenId, tokenId);
    }

    function test_AnyoneMaySubmitProof() public {
        uint256 tokenId = _mint();
        (uint256[] memory proof, uint256[] memory inputs) = _proof();
        vm.prank(makeAddr("randomRelayer"));
        stub.submitProof(tokenId, ARTIFACT_HASH, proof, inputs, address(verifier));
        assertTrue(stub.getVerificationRecord(keccak256(abi.encode(proof, inputs))).passed);
    }

    function test_UnsetTokenProofHashIsZero() public {
        uint256 tokenId = _mint();
        assertEq(stub.getTokenProofHash(tokenId), bytes32(0));
    }
}
