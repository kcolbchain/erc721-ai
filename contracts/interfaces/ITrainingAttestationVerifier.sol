// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ITrainingAttestationVerifier {
    function verifyAttestation(
        bytes32 modelId,
        bytes32 artifactHash,
        bytes calldata attestationData
    ) external view returns (bool);
}
