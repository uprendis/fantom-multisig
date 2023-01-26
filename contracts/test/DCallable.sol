pragma solidity ^0.5.0;

contract DCallable {
    function() payable external {}
    function execute() external {
        address(0).transfer(1);
    }
}

contract DRevertable {
    function() payable external {}
    function execute() external {
        revert("ok");
    }
}
