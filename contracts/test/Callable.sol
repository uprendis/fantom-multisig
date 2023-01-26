pragma solidity ^0.5.0;

contract Callable {
    function() payable external {}
    function send(uint256 amount) payable external {
        address(0).transfer(amount);
    }
}

contract Revertable {
    function() payable external {}
    function send(uint256 amount) external {
        revert("ok");
    }
}
