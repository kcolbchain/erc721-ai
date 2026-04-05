// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ITrainingAttestationVerifier} from "../interfaces/ITrainingAttestationVerifier.sol";

contract MockTrainingAttestationVerifier is ITrainingAttestationVerifier {
    mapping(bytes32 => bool) public approvedDigests;
    bool public acceptAll;

    event AttestationDigestApprovalUpdated(bytes32 indexed digest, bool approved);
    event AcceptAllUpdated(bool acceptAll);

    function setApproval(
        bytes32 modelId,
        bytes32 artifactHash,
        bytes calldata attestationData,
        bool approved
    ) external {
        bytes32 digest = keccak256(abi.encode(modelId, artifactHash, attestationData));
        approvedDigests[digest] = approved;
        emit AttestationDigestApprovalUpdated(digest, approved);
    }

    function setAcceptAll(bool value) external {
        acceptAll = value;
        emit AcceptAllUpdated(value);
    }

    function verifyAttestation(
        bytes32 modelId,
        bytes32 artifactHash,
        bytes calldata attestationData
    ) external view override returns (bool) {
        if (acceptAll) {
            return true;
        }

        bytes32 digest = keccak256(abi.encode(modelId, artifactHash, attestationData));
        return approvedDigests[digest];
    }
}
