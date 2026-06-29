// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../contracts/ERC721AI.sol";
import "../contracts/ERC721AIAttestationHook.sol";
import "../contracts/extensions/ERC721AIZkVerifierStub.sol";
import "../contracts/mocks/MockTrainingAttestationVerifier.sol";
import "./mocks/MockZkVerifier.sol";

/// @notice End-to-end provenance: a multi-hop model lineage (base → fine-tune →
///         distill) where each derived token references its parent's modelId,
///         carries a verified training attestation, and is anchored by a ZK
///         proof bound to its on-chain artifact hash. Exercises the seam
///         between ERC721AI, the attestation hook, and the ZK verifier stub.
contract ProvenanceLineageTest is Test {
    ERC721AI internal nft;
    ERC721AIAttestationHook internal hook;
    ERC721AIZkVerifierStub internal stub;
    MockTrainingAttestationVerifier internal attVerifier;
    MockZkVerifier internal zkVerifier;

    address internal hookOwner;
    address internal stubAdmin;
    address internal creator;
    address internal holder;

    bytes32 internal constant KIND_ZK_TEE = keccak256("zk-tee");

    bytes32 internal constant BASE_ID = keccak256("llama-base");
    bytes32 internal constant FT_ID = keccak256("llama-finetune");
    bytes32 internal constant DISTILL_ID = keccak256("llama-distill");

    bytes32 internal constant BASE_ART = keccak256("base-weights");
    bytes32 internal constant FT_ART = keccak256("finetune-weights");
    bytes32 internal constant DISTILL_ART = keccak256("distill-weights");

    function setUp() public {
        hookOwner = makeAddr("hookOwner");
        stubAdmin = makeAddr("stubAdmin");
        creator = makeAddr("creator");
        holder = makeAddr("holder");

        nft = new ERC721AI("ERC-721 AI", "AI721");
        hook = new ERC721AIAttestationHook(hookOwner);
        stub = new ERC721AIZkVerifierStub(address(nft), stubAdmin);
        attVerifier = new MockTrainingAttestationVerifier();
        zkVerifier = new MockZkVerifier();

        vm.prank(hookOwner);
        hook.setAttestationVerifier(KIND_ZK_TEE, address(attVerifier));
    }

    function _mint(bytes32 modelId, bytes32 artifact, bytes32 base) internal returns (uint256 id) {
        vm.prank(creator);
        id = nft.mintModel(holder, modelId, artifact, base, "ipfs://w", "arch", "MIT", "https://inf", 300);
    }

    function test_ThreeHopLineageWithAttestationAndZkAnchor() public {
        // Hop 0: base model, no parent.
        uint256 baseTok = _mint(BASE_ID, BASE_ART, bytes32(0));
        // Hop 1: fine-tune references the base modelId.
        uint256 ftTok = _mint(FT_ID, FT_ART, BASE_ID);
        // Hop 2: distillation references the fine-tune modelId.
        uint256 distillTok = _mint(DISTILL_ID, DISTILL_ART, FT_ID);

        // ── Lineage links resolve parent → child via tokenIdByModelId. ──
        (,, bytes32 ftBase,,,,,,,) = nft.modelAsset(ftTok);
        (,, bytes32 distillBase,,,,,,,) = nft.modelAsset(distillTok);
        assertEq(ftBase, BASE_ID);
        assertEq(distillBase, FT_ID);
        assertEq(nft.tokenIdByModelId(ftBase), baseTok);
        assertEq(nft.tokenIdByModelId(distillBase), ftTok);

        // Walk the chain from the leaf back to the root.
        uint256 cursor = distillTok;
        uint256 hops;
        while (true) {
            (, , bytes32 parentModelId,,,,,,,) = nft.modelAsset(cursor);
            if (parentModelId == bytes32(0)) break;
            cursor = nft.tokenIdByModelId(parentModelId);
            hops++;
        }
        assertEq(cursor, baseTok);
        assertEq(hops, 2);

        // ── Each token carries a verified training attestation. ──
        attVerifier.setAcceptAll(true);
        hook.registerAndVerifyAttestation(baseTok, BASE_ID, BASE_ART, KIND_ZK_TEE, "att-base");
        hook.registerAndVerifyAttestation(ftTok, FT_ID, FT_ART, KIND_ZK_TEE, "att-ft");
        hook.registerAndVerifyAttestation(distillTok, DISTILL_ID, DISTILL_ART, KIND_ZK_TEE, "att-distill");

        (bytes32 m, bytes32 a, , bytes32 kind, address v, uint64 ts) = hook.attestationsByTokenId(distillTok);
        assertEq(m, DISTILL_ID);
        assertEq(a, DISTILL_ART);
        assertEq(kind, KIND_ZK_TEE);
        assertEq(v, address(attVerifier));
        assertGt(ts, 0);

        // ── Creator stamps the attestation kind onto the token itself. ──
        vm.prank(creator);
        nft.setAttestationKind(distillTok, KIND_ZK_TEE);

        // ── ZK proof anchors the leaf to its on-chain artifact hash. ──
        uint256[] memory proof = new uint256[](1);
        proof[0] = 7;
        uint256[] memory inputs = new uint256[](1);
        inputs[0] = uint256(DISTILL_ART);
        stub.submitProof(distillTok, DISTILL_ART, proof, inputs, address(zkVerifier));

        bytes32 proofHash = stub.getTokenProofHash(distillTok);
        ERC721AIZkVerifierStub.VerificationRecord memory rec = stub.getVerificationRecord(proofHash);
        assertEq(rec.tokenId, distillTok);
        assertEq(rec.artifactHash, DISTILL_ART);
        assertTrue(rec.passed);
    }

    function test_CannotMintDerivedBeforeParentExists() public {
        // Referencing a modelId that has not been minted yet must revert.
        vm.prank(creator);
        vm.expectRevert(ERC721AI.BaseModelNotFound.selector);
        nft.mintModel(holder, FT_ID, FT_ART, BASE_ID, "", "", "", "", 0);
    }

    function test_AttestationSurvivesTokenTransfer() public {
        uint256 tok = _mint(BASE_ID, BASE_ART, bytes32(0));
        attVerifier.setAcceptAll(true);
        hook.registerAndVerifyAttestation(tok, BASE_ID, BASE_ART, KIND_ZK_TEE, "att");

        // Holder sells the token to a new owner.
        address buyer = makeAddr("buyer");
        vm.prank(holder);
        nft.transferFrom(holder, buyer, tok);
        assertEq(nft.ownerOf(tok), buyer);

        // Attestation provenance is unaffected by ownership change.
        (bytes32 m,,,,,uint64 ts) = hook.attestationsByTokenId(tok);
        assertEq(m, BASE_ID);
        assertGt(ts, 0);

        // Royalty still routes to the original creator after the sale.
        (address receiver,) = nft.royaltyInfo(tok, 1 ether);
        assertEq(receiver, creator);
    }

    function test_AttestationKindOnTokenMatchesHookKind() public {
        uint256 tok = _mint(BASE_ID, BASE_ART, bytes32(0));
        attVerifier.setAcceptAll(true);
        hook.registerAndVerifyAttestation(tok, BASE_ID, BASE_ART, KIND_ZK_TEE, "att");

        // The hook recorded KIND_ZK_TEE for this token.
        (,,, bytes32 hookKind,,) = hook.attestationsByTokenId(tok);
        assertEq(hookKind, KIND_ZK_TEE);

        // The creator stamps the SAME kind onto the token; modelAsset does not
        // expose attestationKind, so we assert the on-chain write via its event.
        vm.expectEmit(true, false, false, true);
        emit ERC721AI.AttestationKindUpdated(tok, hookKind);
        vm.prank(creator);
        nft.setAttestationKind(tok, hookKind);
    }

    function test_RevertWhenNonCreatorStampsAttestationKindInLineage() public {
        uint256 tok = _mint(BASE_ID, BASE_ART, bytes32(0));
        // holder owns the token but is not the creator.
        vm.prank(holder);
        vm.expectRevert(ERC721AI.NotOwnerOrApproved.selector);
        nft.setAttestationKind(tok, KIND_ZK_TEE);
    }
}
