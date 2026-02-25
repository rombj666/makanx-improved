"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrderStatus = exports.Role = void 0;
var Role;
(function (Role) {
    Role["CUSTOMER"] = "CUSTOMER";
    Role["VENDOR"] = "VENDOR";
    Role["ORGANIZER"] = "ORGANIZER";
})(Role || (exports.Role = Role = {}));
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING"] = "PENDING";
    OrderStatus["PREPARING"] = "PREPARING";
    OrderStatus["READY"] = "READY";
    OrderStatus["COMPLETED"] = "COMPLETED";
    OrderStatus["CANCELLED"] = "CANCELLED";
})(OrderStatus || (exports.OrderStatus = OrderStatus = {}));
