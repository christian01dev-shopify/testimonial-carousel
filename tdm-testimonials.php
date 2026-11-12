<?php
/**
 * Plugin Name: TDM Testimonials
 * Description: Manage and display accessible, auto-scrolling testimonial carousels with a shortcode.
 * Version: 1.0.0
 * Author: TDM
 * Requires at least: 6.4
 * Requires PHP: 7.4
 * Text Domain: tdm-testimonials
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'TDM_TESTIMONIALS_VERSION', '1.0.0' );
define( 'TDM_TESTIMONIALS_FILE', __FILE__ );
define( 'TDM_TESTIMONIALS_DIR', plugin_dir_path( __FILE__ ) );
define( 'TDM_TESTIMONIALS_URL', plugin_dir_url( __FILE__ ) );

require_once TDM_TESTIMONIALS_DIR . 'includes/class-tdm-testimonials.php';

register_activation_hook( __FILE__, array( 'TDM_Testimonials', 'activate' ) );
register_deactivation_hook( __FILE__, array( 'TDM_Testimonials', 'deactivate' ) );

TDM_Testimonials::instance();
