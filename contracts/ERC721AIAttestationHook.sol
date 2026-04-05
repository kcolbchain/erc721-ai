// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITrainingAttestationVerifier} from "./interfaces/ITrainingAttestationVerifier.sol";

contract ERC721AIAttestationHook {
    struct TrainingAttestation {
        bytes32 modelId;
        bytes32 artifactHash;
        bytes32 attestationHash;
        bytes32 attestationKind;
        address verifier;
        uint64 verifiedAt;
    }

    address public owner;

    mapping(bytes32 => address) public attestationVerifiers;
    mapping(uint256 => TrainingAttestation) public attestationsByTokenId;

    event AttestationVerifierConfigured(bytes32 indexed attestationKind, address indexed verifier);
    event TrainingAttestationVerified(
        uint256 indexed tokenId,
        bytes32 indexed modelId,
        bytes32 indexed artifactHash,
        bytes32 attestationKind,
        address verifier,
        bytes32 attestationHash
    );

    error NotOwner();
    error ZeroAddressVerifier();
    error MissingVerifier(bytes32 attestationKind);
    error AttestationVerificationFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner;
    }

    function setAttestationVerifier(bytes32 attestationKind, address verifier) external onlyOwner {
        if (verifier == address(0)) {
            revert ZeroAddressVerifier();
        }

        attestationVerifiers[attestationKind] = verifier;
        emit AttestationVerifierConfigured(attestationKind, verifier);
    }

    function registerAndVerifyAttestation(
        uint256 tokenId,
        bytes32 modelId,
        bytes32 artifactHash,
        bytes32 attestationKind,
        bytes calldata attestationData
    ) external {
        address verifier = attestationVerifiers[attestationKind];
        if (verifier == address(0)) {
            revert MissingVerifier(attestationKind);
        }

        bool verified = ITrainingAttestationVerifier(verifier).verifyAttestation(
            modelId,
            artifactHash,
            attestationData
        );
        if (!verified) {
            revert AttestationVerificationFailed();
        }

        bytes32 attestationHash = keccak256(attestationData);
        attestationsByTokenId[tokenId] = TrainingAttestation({
            modelId: modelId,
            artifactHash: artifactHash,
            attestationHash: attestationHash,
            attestationKind: attestationKind,
            verifier: verifier,
            verifiedAt: uint64(block.timestamp)
        });

        emit TrainingAttestationVerified(
            tokenId,
            modelId,
            artifactHash,
            attestationKind,
            verifier,
            attestationHash
        );
    }
}
