// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IZkVerifier} from "../../contracts/extensions/ERC721AIZkVerifierStub.sol";

/// @dev Toggleable ZK verifier used to drive ERC721AIZkVerifierStub down both
///      the passing and failing branches deterministically.
contract MockZkVerifier is IZkVerifier {
    bool public result = true;

    function setResult(bool value) external {
        result = value;
    }

    function verifyProof(uint256[] calldata, uint256[] calldata) external view override returns (bool) {
        return result;
    }
}
