# Terraform example for Azure Application Gateway
# Replace resource group, subnet IDs, and backend pool addresses

provider "azurerm" {
  features = {}
}

resource "azurerm_resource_group" "rg" {
  name     = var.rg_name
  location = var.location
}

resource "azurerm_public_ip" "appgw_ip" {
  name                = "appgw-pip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_application_gateway" "appgw" {
  name                = "attendance-appgw"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku {
    name = "Standard_v2"
    tier = "Standard_v2"
  }
  gateway_ip_configuration {
    name      = "appgw-ipcfg"
    subnet_id = var.appgw_subnet_id
  }
  frontend_port {
    name = "httpPort"
    port = 80
  }
  frontend_ip_configuration {
    name                 = "publicFrontendIp"
    public_ip_address_id = azurerm_public_ip.appgw_ip.id
  }
  backend_address_pool {
    name = "backendPool"
    # include backend IPs or FQDNs via backend_address
  }
  http_listener {
    name                           = "listener"
    frontend_ip_configuration_name = "publicFrontendIp"
    frontend_port_name             = "httpPort"
    protocol                       = "Http"
  }
  request_routing_rule {
    name                       = "rule1"
    rule_type                  = "Basic"
    http_listener_name         = "listener"
    backend_address_pool_name  = "backendPool"
    backend_http_settings_name = "defaultHttpSettings"
  }
  backend_http_settings {
    name                  = "defaultHttpSettings"
    cookie_based_affinity = "Disabled"
    port                  = 80
    protocol              = "Http"
    request_timeout       = 30
  }
}
